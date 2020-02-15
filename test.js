var benchBranch = require("./bench");
var grabber = require("./grabber");

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

benchBranch(config).then(result => {
    console.log("===== MASTER RESULT ====== ");
    console.log(grabber.importGrabber(result.masterResult));


    console.log("===== BRANCH RESULT ====== ");
    console.log(grabber.importGrabber(result.branchResult));
})
