var { benchBranch } = require("./bench");
require("dotenv").config();

console.log(`BASE_BRANCH=${process.env.BASE_BRANCH}`);

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-dynamic-extensions",
    baseBranch: process.env.BASE_BRANCH,
    id: "ed25519"
}

benchBranch(console, config).then(report => {
    console.log("Report: ");
    console.log(report);
})
