function errorResult(stderr, step) {
    return { error: true, step, stderr }
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

//::node::import::native::sr25519::transfer_keep_alive::paritydb::small

var BenchConfigs = {
    "import": {
        title: "Import Benchmark (random transfers)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::medium --json'
    },
    "import/small": {
        title: "Import Benchmark (Small block (10tx) with random transfers)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::small --json'
    },
    "import/large": {
        title: "Import Benchmark (Large block (500tx) with random transfers)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::large --json'
    },
    "import/full-wasm": {
        title: "Import Benchmark (Full block with wasm, for weights validation)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::full --json'
    },
    "import/wasm": {
        title: "Import Benchmark via wasm (random transfers)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::medium --json'
    },
    "ed25519": {
        title: "Import Benchmark (random transfers, ed25519 signed)",
        branchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::ed25519::transfer_keep_alive::rocksdb::medium --json'
    }
}

async function benchBranch(app, config) {
    app.log("Waiting our turn to run benchmark...")

    const release = await mutex.acquire();

    try {
        var benchConfig = BenchConfigs[config.id || "import"];
        collector = new libCollector.Collector();

        var benchContext = new BenchContext(app, config);
        console.log(`Started benchmark "${benchConfig.title}."`);
        shell.mkdir("git")
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

        var { stderr, error, stdout } = benchContext.runTask(benchConfig.branchCommand, `Benching ${config.baseBranch}... (${benchConfig.branchCommand})`);
        if (error) return errorResult(stderr);

        await collector.CollectBaseCustomRunner(stdout);

        var { error, stderr } = benchContext.runTask(`git merge origin/${config.branch}`, `Merging branch ${config.branch}`);
        if (error) return errorResult(stderr, "merge");

        var { stderr, error, stdout } = benchContext.runTask(benchConfig.branchCommand, `Benching new branch: ${config.branch}...`);

        await collector.CollectBranchCustomRunner(stdout);

        let report = await collector.Report();
        report = `Benchmark: **${benchConfig.title}**\n\n` + report;

        return report;
    }
    catch (error) {
        return errorResult(error.toString());
    }
    finally {
        release();
    }
}

var RuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Runtime Benchmarks Pallet",
        branchCommand: [
            'cargo run --release --features runtime-benchmarks --manifest-path bin/node/cli/Cargo.toml -- benchmark',
            '--chain dev',
            '--steps 50',
            '--repeat 20',
            '--extrinsic "*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--output ./bin/node/runtime/src/weights',
            '--header ./HEADER',
            '--pallet',
        ].join(' '),
    },
    "custom": {
        title: "Runtime Benchmarks Custom",
        branchCommand: 'cargo run --release --features runtime-benchmarks --manifest-path bin/node/cli/Cargo.toml -- benchmark',
    }
}

function checkRuntimeBenchmarkCommand(command) {
    let required = ["benchmark", "--pallet", "--extrinsic", "--execution", "--wasm-execution", "--steps", "--repeat", "--chain"];
    let missing = [];
    for (const flag of required) {
        if (!command.includes(flag)) {
            missing.push(flag);
        }
    }

    return missing;
}

function checkAllowedCharacters(command) {
    let banned = ["#", "&", "|", ";", ":"];
    for (const token of banned) {
        if (command.includes(token)) {
            return false;
        }
    }

    return true;
}

async function benchmarkRuntime(app, config) {
    app.log("Waiting our turn to run benchmark...")

    const release = await mutex.acquire();

    try {
        if (config.extra.split(" ").length < 2) {
            return errorResult(`Incomplete command.`)
        }

        let command = config.extra.split(" ")[0];
        var benchConfig = RuntimeBenchmarkConfigs[command];
        var extra = config.extra.split(" ").slice(1).join(" ").trim();

        if (!checkAllowedCharacters(extra)) {
            return errorResult(`Not allowed to use #&|;: in the command!`);
        }

        // Append extra flags to the end of the command
        let branchCommand = benchConfig.branchCommand + " " + extra;

        let missing = checkRuntimeBenchmarkCommand(branchCommand);
        let output = branchCommand.includes("--output");

        if (missing.length > 0) {
            return errorResult(`Missing required flags: ${missing.toString()}`)
        }

        var benchContext = new BenchContext(app, config);
        console.log(`Started runtime benchmark "${benchConfig.title}."`);
        shell.mkdir("git")
        shell.cd(cwd + "/git")

        var { error } = benchContext.runTask(`git clone ${config.repository}`, "Cloning git repository...");
        if (error) {
            app.log("Git clone failed, probably directory exists...");
        }

        shell.cd(cwd + "/git/substrate");

        var { error, stderr } = benchContext.runTask(`git fetch`, "Doing git fetch...");
        if (error) return errorResult(stderr);

        // Checkout the custom branch
        var { error, stderr } = benchContext.runTask(`git checkout ${config.branch}`, `Checking out ${config.branch}...`);
        if (error) {
            app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
        }

        var { error, stderr } = benchContext.runTask(`git reset --hard origin/${config.branch}`, `Resetting ${config.branch} hard...`);
        if (error) return errorResult(stderr);

        benchConfig.preparationCommand && benchContext.runTask(benchConfig.preparationCommand);

        // Merge master branch
        var { error, stderr } = benchContext.runTask(`git merge origin/${config.baseBranch}`, `Merging branch ${config.baseBranch}`);
        if (error) return errorResult(stderr, "merge");
        if (config.pushToken) {
            benchContext.runTask(`git push https://${config.pushToken}@github.com/paritytech/substrate.git HEAD`, `Pushing merge with pushToken.`);
        } else {
            benchContext.runTask(`git push`, `Pushing merge.`);
        }

        var { error, stdout, stderr } = benchContext.runTask(branchCommand, `Benching branch: ${config.branch}...`);

        // If `--output` is set, we commit the benchmark file to the repo
        if (output) {
            const regex = /--output(?:=|\s+)(".+?"|\S+)/;
            const path = branchCommand.match(regex)[1];
            benchContext.runTask(`git add ${path}`, `Adding new files.`);
            benchContext.runTask(`git commit -m "${branchCommand}"`, `Committing changes.`);
            if (config.pushToken) {
                benchContext.runTask(`git push https://${config.pushToken}@github.com/paritytech/substrate.git HEAD`, `Pushing commit with pushToken.`);
            } else {
                benchContext.runTask(`git push`, `Pushing commit.`);
            }
        }
        let report = `Benchmark: **${benchConfig.title}**\n\n`
            + branchCommand
            + "\n\n<details>\n<summary>Results</summary>\n\n"
            + (stdout ? stdout : stderr)
            + "\n\n </details>";

        return report;
    }
    catch (error) {
        return errorResult(error.toString());
    }
    finally {
        release();
    }
}

module.exports = {
    benchBranch: benchBranch,
    benchmarkRuntime: benchmarkRuntime,
};
