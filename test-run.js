var benchBranch = require("./bench");
var ui = require("./ui");
require("dotenv").config();

console.log(`BASE_BRANCH=${process.env.BASE_BRANCH}`);

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
    baseBranch: process.env.BASE_BRANCH,
    id: "ed25519"
}

benchBranch(console, config).then(results => {
    console.log("Results: ");
    console.log(results);

    console.log("UI results: ");
    console.log(ui.format(results));
})