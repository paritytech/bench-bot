const { createAppAuth } = require("@octokit/auth-app")
const assert = require("assert")
const fs = require("fs")
const shell = require("shelljs")

var { benchmarkRuntime, benchRustup } = require("./bench")

const githubCommentLimitLength = 65536
const githubCommentLimitTruncateMessage = "<truncated>..."

let isTerminating = false
let appFatalLogger = undefined

for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, function (error, origin) {
    if (isTerminating) {
      return
    }
    isTerminating = true

    try {
      if (appFatalLogger) {
        appFatalLogger({ event, error, origin })
      }
    } catch (error) {
      console.error({ level: "error", event, error, origin, exception })
    }

    process.exit(1)
  })
}

module.exports = (app) => {
  if (process.env.DEBUG) {
    app.log("Running in debug mode")
  }

  appFatalLogger = app.log.fatal

  const baseBranch = process.env.BASE_BRANCH || "master"
  app.log.debug(`base branch: ${baseBranch}`)

  const appId = parseInt(process.env.APP_ID)
  assert(appId)
  const installationId = parseInt(process.env.INSTALLATION_ID);
  assert(installationId);

  const clientId = process.env.CLIENT_ID
  assert(clientId)
  const clientSecret = process.env.CLIENT_SECRET
  assert(clientSecret)

  const privateKeyPath = process.env.PRIVATE_KEY_PATH
  assert(privateKeyPath)
  const privateKey = fs.readFileSync(privateKeyPath).toString()
  assert(privateKey)

  const bbRepo = process.env.BB_REPO;
  assert(bbRepo)

  const bbRepoOwner = process.env.BB_REPO_OWNER;
  assert(bbRepoOwner)

  const bbAppId = parseInt(process.env.BB_APP_ID)
  assert(bbAppId)

  const bbInstallationId = parseInt(process.env.BB_INSTALLATION_ID)
  assert(bbInstallationId)

  const bbClientId = process.env.BB_CLIENT_ID
  assert(bbClientId)
  const bbClientSecret = process.env.BB_CLIENT_SECRET
  assert(bbClientSecret)

  const bbPrivateKeyPath = process.env.BB_PRIVATE_KEY_PATH
  assert(bbPrivateKeyPath)
  const bbPrivateKey = fs.readFileSync(bbPrivateKeyPath).toString()
  assert(bbPrivateKey)
  const authInstallation = createAppAuth({
    appId,
    privateKey,
    clientId,
    clientSecret,
  })

  const bbAuthInstallation = createAppAuth({
    appId: bbAppId,
    privateKey: bbPrivateKey,
    clientId: bbClientId,
    clientSecret: bbClientSecret,
  });

  app.on("issue_comment", async (context) => {
    let commentText = context.payload.comment.body
    const triggerCommand = "/bench"
    if (
      !context.payload.issue.hasOwnProperty("pull_request") ||
      context.payload.action !== "created" ||
      !commentText.startsWith(triggerCommand)
    ) {
      return
    }

    try {
      const sourceInstallationId = (context.payload.installation || {}).id
      if (!sourceInstallationId) {
        await context.octokit.issues.createComment(
          context.issue({
            body: `Error: Installation id was missing from webhook payload`,
          }),
        )
        app.log.error("Installation id was missing from webhook payload");
        return
      } else if (sourceInstallationId != installationId) {
        console.log(`Warning: ignoring payload from irrelevant installation ${sourceInstallationId}`);
        return;
      }

      const getPushDomain = async function () {
        const token = (
          await authInstallation({ type: "installation", installationId })
        ).token

        const url = `https://x-access-token:${token}@github.com`
        return { url, token }
      }

      const getBBPushDomain = async function () {
        const token = (
          await bbAuthInstallation({ type: "installation", installationId: bbInstallationId })
        ).token

        const url = `https://x-access-token:${token}@github.com`
        return { url, token }
      }

      const repo = context.payload.repository.name
      const owner = context.payload.repository.owner.login
      const pull_number = context.payload.issue.number

      // Capture `<action>` in `/bench <action> <extra>`
      let [action, ...extra] = commentText.slice(triggerCommand.length).trim().split(" ")
      extra = extra.join(" ").trim()

      let pr = await context.octokit.pulls.get({ owner, repo, pull_number })
      const contributor = pr.data.head.user.login
      const branch = pr.data.head.ref
      app.log.debug(`branch: ${branch}`)

      var { stdout: toolchain, code: toolchainError } = shell.exec(
        "rustup show active-toolchain --verbose",
        { silent: false },
      )
      if (toolchainError) {
        await context.octokit.issues.createComment(
          context.issue({
            body: "ERROR: Failed to query the currently active Rust toolchain",
          }),
        )
        app.log.fatal("ERROR: Failed to query the currently active Rust toolchain");
        return
      } else {
        toolchain = toolchain.trim()
      }

      // generate a unique branch for our PR
      const bbBranch = `${branch}-benchbot-job-${new Date().getTime()}`;

      const initialInfo = `Starting benchmark for branch: ${branch} (vs ${baseBranch})\nPR branch will be ${bbBranch}\n\nToolchain: \n${toolchain}\n\n Comment will be updated.`
      let comment_id = undefined

      app.log(initialInfo)
      const issueComment = context.issue({ body: initialInfo })
      const issue_comment = await context.octokit.issues.createComment(
        issueComment,
      )
      comment_id = issue_comment.data.id

      let config = {
        owner,
        contributor,
        repo,
        bbRepo,
        bbRepoOwner,
        bbBranch,
        branch,
        baseBranch,
        id: action,
        extra,
        getPushDomain,
        getBBPushDomain,
      }

      // kick off the build/run process...
      let report
      if (action == "runtime" || action == "xcm") {
        report = await benchmarkRuntime(app, config, context.octokit)
      } else if (action == "rustup") {
        report = await benchRustup(app, config)
      } else {
        report = {
          isError: true,
          message: "Unsupported action",
          error: `unsupported action: ${action}`,
        };
      }
      if (process.env.DEBUG) {
        console.log(report)
        return
      }

      if (report.isError) {
        app.log.error(report.message)

        if (report.error) {
          app.log.error(report.error)
        }

        const output = `${report.message}${report.error ? `: ${report.error.toString()}` : ""
          }`

        /*
        await context.octokit.issues.updateComment({
          owner,
          repo,
          comment_id,
          body: `Error running benchmark: **${branch}**\n\n<details><summary>stdout</summary>${output}</details>`,
        })
        */

        return
      }

      let { title, output, extraInfo, benchCommand } = report

      const bodyPrefix = `
Benchmark **${title}** for branch "${branch}" with command ${benchCommand}

Toolchain: ${toolchain}

<details>
<summary>Results</summary>

\`\`\`
`.trim()

      const bodySuffix = `
\`\`\`

</details>
`.trim()

      const padding = 16
      const formattingLength =
        bodyPrefix.length + bodySuffix.length + extraInfo.length + padding
      const length = formattingLength + output.length
      if (length >= githubCommentLimitLength) {
        output = `${output.slice(
          0,
          githubCommentLimitLength -
          (githubCommentLimitTruncateMessage.length + formattingLength),
        )}${githubCommentLimitTruncateMessage}`
      }

      const body = `
${bodyPrefix}
${output}
${bodySuffix}

${extraInfo}
`.trim()

      await context.octokit.issues.updateComment({
        owner,
        repo,
        comment_id,
        body,
      })
    } catch (error) {
      console.log(error);

      app.log.fatal({
        error,
        repo,
        owner,
        pull_number,
        msg: "Caught exception in issue_comment's handler",
      })
      await context.octokit.issues.createComment(
        context.issue({
          body: `Exception caught: \`${error.message}\`\n${error.stack}`,
        }),
      )
    }
  })
}
