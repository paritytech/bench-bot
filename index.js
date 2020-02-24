
var benchBranch = require("./bench");
var ui = require("./ui");

module.exports = app => {
  app.log(`base branch: ${process.env.BASE_BRANCH}`);

  app.on('issue_comment', async context => {
    let commentText = context.payload.comment.body;
    if (!commentText.startsWith("/bench")) {
      return;
    }

    let benchId = (commentText.split(" ")[1] || "import").trim();

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;

    let pr = await context.github.pulls.get({ owner, repo, pull_number });
    const branchName = pr.data.head.ref;
    app.log(`branch: ${branchName}`);
    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branchName} (vs ${process.env.BASE_BRANCH})\n\n Comment will be updated.` });
    const issue_comment = await context.github.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let config = {
      repository: "https://github.com/paritytech/substrate",
      branch: branchName,
      baseBranch: process.env.BASE_BRANCH,
      id: benchId,
    }

    results = ui.format(await benchBranch(app, config));

    context.github.issues.updateComment({
      owner, repo, comment_id,
      body: `Finished benchmark for branch: **${branchName}**\n\n${results}`,
    });

    return;
  })
}
