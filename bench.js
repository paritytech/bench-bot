function errorResult(stderr) {
    return { masterResult: "ERROR: " + stderr, branchResult: "" }
}

let cwd = process.cwd();
console.log(`process cwd: ${cwd}`);

const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();
var shell = require('shelljs');

var libCollector = require("./collector");

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

var BenchConfigs = {
    "import": {
        title: "Import Benchmark (random transfers)",
        branchCommand: 'cargo run -p node-bench -- node::import::wasm::sr25519 --json'
    },
    "ed25519": {
        title: "Import Benchmark (random transfers)",
        branchCommand: 'cargo run -p node-bench -- node::import::wasm::ed25519 --json'
    }
}

async function benchBranch(app, config) {
    app.log("Waiting our turn to run benchmark...")

    const release = await mutex.acquire();
    var benchConfig = BenchConfigs[config.id || "import"];
    var resultsPath = "./" + benchConfig.criterionDir;
    collector = new libCollector.Collector();

    try {
        var benchContext = new BenchContext(app, config);
        console.log(`Started benchmark "${benchConfig.title}."`);
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

        benchConfig.preparationCommand && benchContext.runTask(benchConfig.preparationCommand);

        var { stderr, error } = benchContext.runTask(benchConfig.branchCommand, `Benching ${config.baseBranch}... (${benchConfig.branchCommand})`);
        if (error) return errorResult(stderr);
        await collector.CollectBaseCriterionWasmNative(resultsPath);

        var { error, stderr } = benchContext.runTask(`git merge origin/${config.branch}`, `Merging branch ${config.branch}`);
        if (error) return errorResult(stderr);

        var { stderr, error, stdout } = benchContext.runTask(benchConfig.branchCommand, `Benching new branch: ${config.branch}...`);

        await collector.CollectBranchCriterionWasmNative(stdout);

        let report = await collector.Report();
        report = `Benchmark: **${benchConfig.title}**\n\n` + report;

        return report;
    } finally {
        release();
    }
}

module.exports = benchBranch;