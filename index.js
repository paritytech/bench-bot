
var benchBranch = require("./bench");
var grabber = require("./grabber");

module.exports = app => {
  app.on('issue_comment', async context => {
    let commentText = context.payload.comment.body;
    if (!commentText.startsWith("/bench")) {
      return;
    }

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;

    let pr = await context.github.pulls.get({ owner, repo, pull_number });
    const branchName = pr.data.head.ref;
    app.log(`branch: ${branchName}`);
    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branchName}\n\n Comment will be updated.` });
    const issue_comment = await context.github.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let config = {
      repository: "https://github.com/paritytech/substrate",
      branch: branchName,
    }

    let { masterResult, branchResult } = await benchBranch(app, config);

    const masterHeader = "===== MASTER RESULT ======";
    const codeBreak = "```";
    const branchHeader = "===== BRANCH RESULT ======";

    const results = [
      masterHeader,
      codeBreak,
      grabber.importGrabber(masterResult),
      codeBreak,
      "",
      branchHeader,
      codeBreak,
      grabber.importGrabber(branchResult),
      codeBreak
    ].join("\n");

    context.github.issues.updateComment({
      owner, repo, comment_id,
      body: `Finished benchmark for branch: ${branchName}\n${results}`,
    });

    return;
  })
}
