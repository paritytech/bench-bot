const { createAppAuth } = require("@octokit/auth-app")
const assert = require("assert")
const fs = require("fs")
const shell = require("shelljs")
const Mutex = require("async-mutex").Mutex

var { benchBranch, benchmarkRuntime, benchRustup } = require("./bench")

const githubCommentLimitLength = 65536
const githubCommentLimitTruncateMessage = "<truncated>..."

let isTerminating = false
let logFatal = undefined

let pendingPayloadCount = 0

for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, function (error, origin) {
    if (isTerminating) {
      return
    }
    isTerminating = true

    try {
      if (logFatal) {
        logFatal({ event, error, origin })
      }
    } catch (error) {
      console.error({ level: "error", event, error, origin, exception })
    }

    process.exit(1)
  })
}

const mutex = new Mutex()
module.exports = (app) => {
  if (process.env.DEBUG) {
    app.log("Running in debug mode")
  }

  // Crash the server on Probot failures or errors
  // We retain the original error handlers on logError and logFatal so that the
  // application can still report errors on the expected channels
  // This is necessary to work around problems in reconnection issues from our
  // event source
  // (https://github.com/paritytech/bench-bot/issues/83#issuecomment-1024283664)
  // FIXME: This is suboptimal and we should not have to stop the application in
  // case of errors
  // The server will automatically restarted upon exit in ./run
  let isWaitingForExitingWhenFree = false
  const exitWhenFree = async function() {
    const isFree = await mutex.runExclusive(function () {
      return pendingPayloadCount === 0
    })
    if (isFree) {
      process.exit(1)
    } else {
      await exitWhenFree()
    }
  }
  const logThenExit = function(log) {
    return async function(...args) {
      log(...args)
      // only exit the application after the current events have been processed
      // we only need to register this action once since exitWhenFree calls itself
      if (isWaitingForExitingWhenFree) {
        return
      }
      isWaitingForExitingWhenFree = true
      await exitWhenFree()
    }
  }
  const logError = app.log.error
  app.log.error = logThenExit(logError)
  logFatal = app.log.fatal
  app.log.fatal = logThenExit(logFatal)

  const baseBranch = process.env.BASE_BRANCH || "master"
  app.log.debug(`base branch: ${baseBranch}`)

  const appId = parseInt(process.env.APP_ID)
  assert(appId)

  const clientId = process.env.CLIENT_ID
  assert(clientId)
  const clientSecret = process.env.CLIENT_SECRET
  assert(clientSecret)

  const privateKeyPath = process.env.PRIVATE_KEY_PATH
  assert(privateKeyPath)
  const privateKey = fs.readFileSync(privateKeyPath).toString()
  assert(privateKey)

  const authInstallation = createAppAuth({
    appId,
    privateKey,
    clientId,
    clientSecret,
  })

  app.on("issue_comment", async (context) => {
    pendingPayloadCount++
    await mutex.runExclusive(async function() {
      let commentText = context.payload.comment.body
      if (
        !context.payload.issue.hasOwnProperty("pull_request") ||
        context.payload.action !== "created" ||
        !commentText.startsWith("/bench")
      ) {
        return
      }

      try {
        const installationId = (context.payload.installation || {}).id
        if (!installationId) {
          await context.octokit.issues.createComment(
            context.issue({
              body: `Error: Installation id was missing from webhook payload`,
            }),
          )
          return
        }

        const getPushDomain = async function () {
          const token = (
            await authInstallation({ type: "installation", installationId })
          ).token

          const url = `https://x-access-token:${token}@github.com`
          return { url, token }
        }

        const repo = context.payload.repository.name
        const owner = context.payload.repository.owner.login
        const pull_number = context.payload.issue.number

        // Capture `<action>` in `/bench <action> <extra>`
        let action = commentText.split(" ").splice(1, 1).join(" ").trim()
        // Capture all `<extra>` text in `/bench <action> <extra>`
        let extra = commentText.split(" ").splice(2).join(" ").trim()

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
          return
        } else {
          toolchain = toolchain.trim()
        }

        const initialInfo = `Starting benchmark for branch: ${branch} (vs ${baseBranch})\n\nToolchain: \n${toolchain}\n\n Comment will be updated.`
        let comment_id = undefined
        if (process.env.DEBUG) {
          app.log(initialInfo)
        } else {
          const issueComment = context.issue({ body: initialInfo })
          const issue_comment = await context.octokit.issues.createComment(
            issueComment,
          )
          comment_id = issue_comment.data.id
        }

        let config = {
          owner,
          contributor,
          repo,
          branch,
          baseBranch,
          id: action,
          extra,
          getPushDomain,
          logFatal
        }

        let report
        if (action == "runtime" || action == "xcm") {
          report = await benchmarkRuntime(app, config)
        } else if (action == "rustup") {
          report = await benchRustup(app, config)
        } else {
          report = await benchBranch(app, config)
        }
        if (process.env.DEBUG) {
          console.log(report)
          return
        }

        if (report.isError) {
          logError(report.message)

          if (report.error) {
            logError(report.error)
          }

          const output = `${report.message}${report.error ? `: ${report.error.toString()}` : ""
            }`

          await context.octokit.issues.updateComment({
            owner,
            repo,
            comment_id,
            body: `Error running benchmark: **${branch}**\n\n<details><summary>stdout</summary>${output}</details>`,
          })

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
        logFatal({
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
    pendingPayloadCount--
  })
}
