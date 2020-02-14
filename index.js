
import benchBranch from "./bench";

export default app => {
  app.on('issue_comment', async context => {

    let commentText = context.payload.comment.body;
    if (!commentText.startsWith("/bench")) {
      return;
    }

    const repo = context.payload.repository.name;
    const owner = context.payload.repository.owner.login;
    const pull_number = context.payload.issue.number;
    console.log(`repo/owner/id: ${repo}/${owner}/${pull_number}`);

    let pr = await context.github.pulls.get({ owner, repo, pull_number });
    const branchName = pr.data.head.ref;
    console.log(`branch: ${branchName}`);

    const issueComment = context.issue({ body: `Starting benchmark for branch: ${branchName}\n\n Comment will be updated.` });
    const issue_comment = await context.github.issues.createComment(issueComment);
    const comment_id = issue_comment.data.id;

    let config = {
      repository: "https://github.com/paritytech/substrate",
      branch: branchName,
   }

    let { masterResult, branchResult } = benchBranch(config);

    let results = `===== MASTER RESULT ======\n${masterResult}\n===== BRANCH RESULT ======\n${branchResult}`;

    context.github.issues.updateComment({
      owner, repo, comment_id,
      body: `Finished benchmark for branch: ${branchName}\n${results}`,
    });

    return;
  })
}
