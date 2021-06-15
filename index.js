const { createAppAuth } = require("@octokit/auth-app")
const assert = require("assert")
const fs = require("fs")

var { benchBranch, benchmarkRuntime } = require("./bench");

module.exports = app => {
  const baseBranch = process.env.BASE_BRANCH || "master"
  app.log(`base branch: ${baseBranch}`);

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

  app.on('issue_comment', async context => {
    let commentText = context.payload.comment.body;
    if (
      !context.payload.issue.hasOwnProperty("pull_request") ||
      context.payload.action !== "created" ||
      !commentText.startsWith("/bench")
    ) {
      return;
    }

    const installationId = (context.payload.installation || {}).id;
    if (!installationId) {
      await context.octokit.issues.createComment(
        context.issue({ body: `Error: Installation id was missing from webhook payload` })
      )
      return
    }

    const getPushDomain = async function() {
      const token = (
        await authInstallation({
          type: "installation",
          installationId,
        })
      ).token

      return `https://x-access-token:${token}@github.com`
    }

    // Capture `<action>` in `/bench <action> <extra>`
    let action = commentText.split(" ").splice(1, 1).join(" ").trim();
    // Capture all `<extra>` text in `/bench <action> <extra>`
    let extra = commentText.split(" ").splice(2).join(" ").trim();

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;

    let pr = await context.octokit.pulls.get({ owner, repo, pull_number });
    const contributor = pr.data.head.user.login;
    const branch = pr.data.head.ref;
    app.log(`branch: ${branch}`);

    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branch} (vs ${baseBranch})\n\n Comment will be updated.` });
    const issue_comment = await context.octokit.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let config = {
      owner,
      contributor,
      repo,
      branch,
      baseBranch,
      id: action,
      extra,
      getPushDomain
    }

    let report;
    if (action == "runtime") {
      report = await benchmarkRuntime(app, config)
    } else {
      report = await benchBranch(app, config)
    };

    // Max github body is 65536 characters... we are a little conservative.
    report = report.substring(0, 65000)

    if (report.error) {
      app.log(`error: ${report.stderr}`)
      if (report.step != "merge") {
        context.octokit.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branch}**\n\n<details><summary>stdout</summary>${report.stderr}</details>`,
        });
      } else {
        context.octokit.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branch}**\n\nMerge conflict merging branch to master!`,
        });
      }
    } else {
      app.log(`report: ${report}`);
      context.octokit.issues.updateComment({
        owner, repo, comment_id,
        body: `Finished benchmark for branch: **${branch}**\n\n${report}`,
      });
    }

    return;
  })
}
