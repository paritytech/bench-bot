var shell = require('shelljs');
var { benchBranch, benchmarkRuntime, benchEVM } = require("./bench");

module.exports = app => {
  app.log(`base branch: ${process.env.BASE_BRANCH}`);

  app.on('issue_comment', async context => {
    let commentText = context.payload.comment.body;

    const triggerCommand = "/bench";
    if (!commentText.startsWith(triggerCommand)) {
      return;
    }

    // Capture `<action>` in `/bench <action> <extra>`
    let [action, ...rest] = commentText.slice(triggerCommand.length).trim().split(" ");
    // Rest is `<extra>`
    let extra = rest.join(" ").trim();

    if (action === "clean") {
      app.log('execute clean command');
      shell.exec("rm -rf git", { silent: false });
      const issueComment = context.issue({ body: `Clean done` });
      await context.octokit.issues.createComment(issueComment);
      return;
    }

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;

    let pr = await context.octokit.pulls.get({ owner, repo, pull_number });
    const branchName = pr.data.head.ref;
    app.log(`branch: ${branchName}`);
    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branchName} (vs ${process.env.BASE_BRANCH})\n\n Comment will be updated.` });
    const issue_comment = await context.octokit.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let config = {
      owner: owner,
      repo: repo,
      branch: branchName,
      baseBranch: process.env.BASE_BRANCH,
      id: action,
      pushToken: process.env.PUSH_TOKEN,
      extra: extra,
    }

    let report;
    if (action == "runtime") {
      report = await benchmarkRuntime(app, config)
    } else if (action == "evm") {
      report = await benchEVM(app, config);
    } else {
      report = await benchBranch(app, config)
    };

    if (report.error) {
      app.log(`error: ${report.stderr}`)
      if (report.step != "merge") {
        context.octokit.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branchName}**\n\n<details><summary>stdout</summary>${report.stderr}</details>`,
        });
      } else {
        context.octokit.issues.updateComment({
          owner, repo, comment_id,
          body: `Error running benchmark: **${branchName}**\n\nMerge conflict merging branch to master!`,
        });
      }
    } else {
      app.log(`report: ${report}`);
      context.octokit.issues.updateComment({
        owner, repo, comment_id,
        body: `Finished benchmark for branch: **${branchName}**\n\n${report}`,
      });
    }

    return;
  })
}
