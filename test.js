var benchBranch = require("./bench");
var ui = require("./ui");
require("dotenv").config();

console.log(`BASE_BRANCH=${process.env.BASE_BRANCH}`);

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

benchBranch(console, config).then(results => {
    console.log(ui.format(results));
})