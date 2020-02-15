var benchBranch = require("./bench");

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

benchBranch(config).then(result => {
    console.log("===== MASTER RESULT ====== ");
    console.log(result.masterResult);


    console.log("===== BRANCH RESULT ====== ");
    console.log(result.branchResult);
})

