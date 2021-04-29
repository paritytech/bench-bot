const fs = require("fs")
const { createAppAuth } = require("@octokit/auth-app");
var { benchBranch, benchmarkRuntime } = require("./bench");

module.exports = app => {
    const authenticator = createAppAuth({
        appId: 1,
        privateKey: fs.readFileSync(process.env.PRIVATE_KEY_PATH).toString(),
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
    })
  app.log(`base branch: ${process.env.BASE_BRANCH}`);

  app.on('issue_comment', async context => {
    let commentText = context.payload.comment.body;
    if (context.payload.action !== "created" || !commentText.startsWith("/bench")) {
      return;
    }

    // Capture `<action>` in `/bench <action> <extra>`
    let action = commentText.split(" ").splice(1, 1).join(" ").trim();
    // Capture all `<extra>` text in `/bench <action> <extra>`
    let extra = commentText.split(" ").splice(2).join(" ").trim();

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;

    let pr = await context.github.pulls.get({ owner, repo, pull_number });
    const branchName = pr.data.head.ref;
    app.log(`branch: ${branchName}`);
    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branchName} (vs ${process.env.BASE_BRANCH})\n\n Comment will be updated.` });
    const issue_comment = await context.github.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let pushToken = process.env.PUSH_TOKEN
    if (!pushToken) {
        const auth = await authenticator({ type: "app" })
        pushToken = auth.token
    }

    let config = {
      owner: owner,
      repo: repo,
      branch: branchName,
      baseBranch: process.env.BASE_BRANCH,
      id: action,
      pushToken,
      extra: extra,
    }

    let report;
    if (action == "runtime") {
      report = await benchmarkRuntime(app, config, context)
    } else {
      report = await benchBranch(app, config, context)
    };

    if (report.error) {
      app.log(`error: ${report.stderr}`)
      if (report.step != "merge") {
        context.github.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branchName}**\n\n<details><summary>stdout</summary>${report.stderr}</details>`,
        });
      } else {
        context.github.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branchName}**\n\nMerge conflict merging branch to master!`,
        });
      }
    } else {
      app.log(`report: ${report}`);
      context.github.issues.updateComment({
        owner, repo, comment_id,
        body: `Finished benchmark for branch: **${branchName}**\n\n${report}`,
      });
    }

    return;
  })
}
