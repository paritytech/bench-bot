import benchBranch from "./bench";

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

var { masterResult, branchResult } = benchBranch(config);

console.log("===== MASTER RESULT ====== ");
console.log(masterResult);


console.log("===== BRANCH RESULT ====== ");
console.log(branchResult);