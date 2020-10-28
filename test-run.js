var { benchBranch } = require("./bench");
require("dotenv").config();

console.log(`BASE_BRANCH=${process.env.BASE_BRANCH}`);

let config = {
    owner: "paritytech",
    repo: "substrate",
    branch: "nv-dynamic-extensions",
    baseBranch: process.env.BASE_BRANCH,
    id: "ed25519",
    pushToken: null,
    extra: null,
}

benchBranch(console, config).then(report => {
    console.log("Report: ");
    console.log(report);
})
