function errorResult(stderr) {
    return { masterResult: "ERROR: " + stderr, branchResult: "" }
}

let cwd = process.cwd();
console.log(`process cwd: ${cwd}`);

const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();
var shell = require('shelljs');

function BenchContext(app, config) {
    var self = this;
    self.app = app;
    self.config = config;

    self.runTask = function(cmd, title) {
        if (title) app.log(title);

        const { stdout, stderr, code } = shell.exec(cmd, { silent: true });
        var error = false;

        if (code != 0) {
            app.log(`ops.. Something went wrong (error code ${code})`);
            app.log(`stderr: ${stderr}`);
            error = true;
        }

        return { stdout, stderr, error };
    }
}

async function benchBranch(app, config) {
    app.log("Waiting our turn to run benchmark...")

    const release = await mutex.acquire();
    try {
        var benchContext = new BenchContext(app, config);
        console.log("Started benchmark.");
        shell.cd(cwd + "/git")

        var { error } = benchContext.runTask(`git clone ${config.repository}`, "Cloning git repository...");
        if (error) {
            app.log("Git clone failed, probably directory exists...");
        }

        shell.cd(cwd + "/git/substrate");

        var { error, stderr } = benchContext.runTask(`git fetch`, "Doing git fetch...");
        if (error) return errorResult(stderr);

        var { error, stderr } = benchContext.runTask(`git checkout ${config.baseBranch}`, `Checking out ${config.baseBranch}...`);
        if (error) {
            app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
        }

        var { error, stderr } = benchContext.runTask(`git reset --hard origin/${config.baseBranch}`, `Resetting ${config.baseBranch} hard...`);
        if (error) return errorResult(stderr);

        benchContext.runTask(`rm -rf ./bin/node/testing/target/criterion`);

        var { stdout, stderr, error } = benchContext.runTask('cargo bench -p node-testing "import block"', `Benching ${config.baseBranch}...`);
        if (error) return errorResult(stderr);
        var masterResult = stdout;

        var { error, stderr } = benchContext.runTask(`git merge origin/${config.branch}`, `Merging branch ${config.branch}`);
        if (error) return errorResult(stderr);

        var { stdout, stderr, error } = benchContext.runTask('cargo bench -p node-testing import', "Benching new branch...");
        var branchResult = error ? "ERROR: " + stderr : stdout;

        return { masterResult, branchResult };
    } finally {
        release();
    }
}

module.exports = benchBranch;