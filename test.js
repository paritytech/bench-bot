var benchBranch = require("./bench");
var grabber = require("./grabber");

let config = {
    repository: "https://github.com/paritytech/substrate",
    branch: "nv-signatures",
}

benchBranch(console, config).then(result => {
    const masterHeader = "===== MASTER RESULT ======";
    const codeBreak = "```";
    const branchHeader = "===== BRANCH RESULT ======";

    console.log([
        masterHeader,
        codeBreak,
        grabber.importGrabber(result.masterResult),
        codeBreak,
        "",
        branchHeader,
        codeBreak,
        grabber.importGrabber(result.branchResult),
        codeBreak
      ].join("\n")
    );
})