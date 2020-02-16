var benchBranch = require("./bench");
var ui = require("./ui");

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

benchBranch(console, config).then(results => {
    console.log(ui.format(results));
})