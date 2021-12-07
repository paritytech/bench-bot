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
        const secrets = [
            self.config.pushToken
        ].filter(Boolean);

        if (title) app.log(title);

        const redacted = secrets.reduce((x, s) => x.replaceAll(s, '***'), cmd);

        app.log(redacted);

        let silent = true;
        if (process.env.SILENT == 'false') {
            silent = false;
        }
        const { stdout, stderr, code } = shell.exec(cmd, { silent });
        var error = false;

        if (code != 0) {
            app.log(`Error code ${code}: ${stderr}`);
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
        if (config.repo != "substrate") {
            return errorResult("Node benchmarks only available on Substrate.")
        }

        var benchConfig = BenchConfigs[config.id || "import"];
        collector = new libCollector.Collector();

        var benchContext = new BenchContext(app, config);
        console.log(`Started benchmark "${benchConfig.title}."`);
        shell.mkdir("git")
        shell.cd(cwd + "/git")

        var { error } = benchContext.runTask(`git clone https://github.com/${config.owner}/${config.repo}`, "Cloning git repository...");
        if (error) {
            app.log("Git clone failed, probably directory exists...");
        }

        shell.cd(cwd + `/git/${config.repo}`);

        var { error, stderr } = benchContext.runTask(`git fetch`, "Doing git fetch...");
        if (error) return errorResult(stderr);

        var { error, stderr } = benchContext.runTask(`git submodule update --init`);
        if (error) return errorResult(stderr);

        var { error, stderr } = benchContext.runTask(`git checkout ${config.baseBranch}`, `Checking out ${config.baseBranch}...`);
        if (error) {
            app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
        }

        var { error, stderr } = benchContext.runTask(`git reset --hard origin/${config.baseBranch}`, `Resetting ${config.baseBranch} hard...`);
        if (error) return errorResult(stderr);

        benchConfig.preparationCommand && benchContext.runTask(benchConfig.preparationCommand, 'Preparing...');

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

var SubstrateRuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Benchmark Runtime Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--manifest-path=bin/node/cli/Cargo.toml',
            '--',
            'benchmark',
            '--chain=dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--output=./frame/{pallet_folder}/src/weights.rs',
            '--template=./.maintain/frame-weight-template.hbs',
        ].join(' '),
    },
    "substrate": {
        title: "Benchmark Runtime Substrate Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--manifest-path=bin/node/cli/Cargo.toml',
            '--',
            'benchmark',
            '--chain=dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--output=./frame/{pallet_folder}/src/weights.rs',
            '--template=./.maintain/frame-weight-template.hbs',
        ].join(' '),
    },
    "custom": {
        title: "Benchmark Runtime Custom",
        branchCommand: 'cargo run --release --features runtime-benchmarks --manifest-path bin/node/cli/Cargo.toml -- benchmark',
    }
}

var PolkadotRuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Benchmark Runtime Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--',
            'benchmark',
            '--chain=polkadot-dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--header=./file_header.txt',
            '--output=./runtime/polkadot/src/weights/',
        ].join(' '),
    },
    "polkadot": {
        title: "Benchmark Runtime Polkadot Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--',
            'benchmark',
            '--chain=polkadot-dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--header=./file_header.txt',
            '--output=./runtime/polkadot/src/weights/',
        ].join(' '),
    },
    "kusama": {
        title: "Benchmark Runtime Kusama Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--',
            'benchmark',
            '--chain=kusama-dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--header=./file_header.txt',
            '--output=./runtime/kusama/src/weights/',
        ].join(' '),
    },
    "westend": {
        title: "Benchmark Runtime Westend Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--',
            'benchmark',
            '--chain=westend-dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--header=./file_header.txt',
            '--output=./runtime/westend/src/weights/',
        ].join(' '),
    },
    "custom": {
        title: "Benchmark Runtime Custom",
        branchCommand: 'cargo run --release --features runtime-benchmarks -- benchmark',
    }
}

/**
 * {
 *      [task]: {
 *          title: "task string",
 *          preparationCommand: "any setup command before benchmark",
 *          branchCommand: "benchmark command"
 *      }
 * }
 */
var AcalaRuntimeBenchmarkConfigs = {
    "module": {
        title: "Benchmark Runtime Module",
        branchCommand: [
            'cargo run --release --color=never',
            '--bin=acala',
            '--features=runtime-benchmarks',
            '--features=with-mandala-runtime',
            '--',
            'benchmark',
            '--chain=dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--output=./modules/{pallet_folder}/src/weights.rs',
            '--template=./templates/module-weight-template.hbs',
        ].join(' '),
    },
    "acala": {
        title: "Benchmark Runtime Acala Module",
        branchCommand: [
            'cargo run --release --color=never',
            '--bin=acala',
            '--features=runtime-benchmarks',
            '--features=with-acala-runtime',
            '--',
            'benchmark',
            '--chain=acala-latest',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--template=./templates/runtime-weight-template.hbs',
            '--output=./runtime/acala/src/weights/',
        ].join(' '),
    },
    "karura": {
        title: "Benchmark Runtime Karura Module",
        branchCommand: [
            'cargo run --release --color=never',
            '--bin=acala',
            '--features=runtime-benchmarks',
            '--features=with-karura-runtime',
            '--',
            'benchmark',
            '--chain=karura-dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--template=./templates/runtime-weight-template.hbs',
            '--output=./runtime/karura/src/weights/',
        ].join(' '),
    },
    "mandala": {
        title: "Benchmark Runtime Mandala Module",
        branchCommand: [
            'cargo run --release --color=never',
            '--bin=acala',
            '--features=runtime-benchmarks',
            '--features=with-mandala-runtime',
            '--',
            'benchmark',
            '--chain=dev',
            '--steps=50',
            '--repeat=20',
            '--pallet={pallet_name}',
            '--extrinsic="*"',
            '--execution=wasm',
            '--wasm-execution=compiled',
            '--heap-pages=4096',
            '--template=./templates/runtime-weight-template.hbs',
            '--output=./runtime/mandala/src/weights/',
        ].join(' '),
    },
    "custom-mandala": {
        title: "Benchmark Mandala Runtime Custom",
        branchCommand: 'cargo run --release --color=never --bin acala --features=with-mandala-runtime --features runtime-benchmarks -- benchmark',
    },
    "custom-karura": {
        title: "Benchmark Karura Runtime Custom",
        branchCommand: 'cargo run --release --color=never --bin acala --features=with-karura-runtime --features runtime-benchmarks -- benchmark',
    },
    "custom-acala": {
        title: "Benchmark Acala Runtime Custom",
        branchCommand: 'cargo run --release --color=never --bin acala --features=with-acala-runtime --features runtime-benchmarks -- benchmark',
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
    let banned = ["#", "&", "|", ";"];
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

        // Capture `<task>` in `<task> <extra>`
        let [task, ...rest] = config.extra.split(" ");

        // Rest is `<extra>`
        var extra = rest.join(" ").trim();

        var benchConfig;
        if (config.repo === "substrate") {
            benchConfig = SubstrateRuntimeBenchmarkConfigs[task];
        } else if (config.repo === "polkadot") {
            benchConfig = PolkadotRuntimeBenchmarkConfigs[task];
        } else if (config.repo.toLowerCase() === "acala") {
            benchConfig = AcalaRuntimeBenchmarkConfigs[task];
        } else {
            return errorResult(`${config.repo} repo is not supported.`)
        }

        if (!checkAllowedCharacters(extra)) {
            return errorResult(`Not allowed to use #&|; in the command!`);
        }

        // Append extra flags to the end of the command
        let branchCommand = benchConfig.branchCommand;
        if (task.startsWith("custom")) {
            // extra here should just be raw arguments to add to the command
            branchCommand += " " + extra;
        } else {
            // extra here should be the name of a pallet
            branchCommand = branchCommand.replace("{pallet_name}", extra);
            // pallet folder should be just the name of the pallet, without the leading
            // "pallet_" or "frame_", then separated with "-"
            let palletFolder = extra.split("_").slice(1).join("-").trim();
            branchCommand = branchCommand.replace("{pallet_folder}", palletFolder);
        }

        let missing = checkRuntimeBenchmarkCommand(branchCommand);
        let output = branchCommand.includes("--output");

        if (missing.length > 0) {
            return errorResult(`Missing required flags: ${missing.toString()}`)
        }

        var benchContext = new BenchContext(app, config);
        console.log(`Started runtime benchmark "${benchConfig.title}."`);
        shell.mkdir("-p", "git")
        shell.cd(cwd + "/git")

        var { error } = benchContext.runTask(`git clone https://github.com/${config.owner}/${config.repo}`, "Cloning git repository...");
        if (error) {
            app.log("Git clone failed, probably directory exists...");
        }

        shell.cd(cwd + `/git/${config.repo}`);

        var { error, stderr } = benchContext.runTask(`git fetch`, "Doing git fetch...");
        if (error) return errorResult(stderr);

        // Checkout the custom branch
        var { error, stderr } = benchContext.runTask(`git checkout ${config.branch}`, `Checking out ${config.branch}...`);
        if (error) {
            app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
        }

        var { error, stderr } = benchContext.runTask(`git reset --hard origin/${config.branch}`, `Resetting ${config.branch} hard...`);
        if (error) return errorResult(stderr);

        var { error, stderr } = benchContext.runTask(`git submodule update --init`);
        if (error) return errorResult(stderr);

        benchConfig.preparationCommand && benchContext.runTask(benchConfig.preparationCommand, 'Preparing...');

        // Merge master branch
        var { error, stderr } = benchContext.runTask(`git merge origin/${config.baseBranch}`, `Merging branch ${config.baseBranch}`);
        if (error) return errorResult(stderr, "merge");
        if (config.pushToken) {
            benchContext.runTask(`git push https://${config.pushToken}@github.com/${config.owner}/${config.repo}.git HEAD`, `Pushing merge with pushToken.`);
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
                benchContext.runTask(`git push https://${config.pushToken}@github.com/${config.owner}/${config.repo}.git HEAD`, `Pushing commit with pushToken.`);
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

async function benchEVM(app, config) {
    app.log("Waiting our turn to run benchmark...")

    const release = await mutex.acquire();

    try {
        var benchContext = new BenchContext(app, config);
        console.log("Started EVM benchmark");
        shell.mkdir("-p", "git")
        shell.cd(cwd + "/git")

        var { error } = benchContext.runTask(`git clone https://github.com/${config.owner}/${config.repo}`, "Cloning git repository...");
        if (error) {
            app.log("Git clone failed, probably directory exists...");
        }

        shell.cd(cwd + `/git/${config.repo}`);

        var { error, stderr } = benchContext.runTask(`git fetch`, "Doing git fetch...");
        if (error) return errorResult(stderr);

        // Checkout the custom branch
        var { error, stderr } = benchContext.runTask(`git checkout ${config.branch}`, `Checking out ${config.branch}...`);
        if (error) {
            app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
        }

        var { error, stderr } = benchContext.runTask(`git reset --hard origin/${config.branch}`, `Resetting ${config.branch} hard...`);
        if (error) return errorResult(stderr);

        var { error, stderr } = benchContext.runTask(`git submodule update --init`);
        if (error) return errorResult(stderr);

        // Merge master branch
        var { error, stderr } = benchContext.runTask(`git merge origin/${config.baseBranch}`, `Merging branch ${config.baseBranch}`);
        if (error) return errorResult(stderr, "merge");
        if (config.pushToken) {
            benchContext.runTask(`git push https://${config.pushToken}@github.com/${config.owner}/${config.repo}.git HEAD`, `Pushing merge with pushToken.`);
        } else {
            benchContext.runTask(`git push`, `Pushing merge.`);
        }

        const branchCommand = `make bench-evm`;
        var { error, stdout, stderr } = benchContext.runTask(branchCommand, `Benching branch: ${config.branch}...`);

        benchContext.runTask(`git add runtime/common/src/gas_to_weight_ratio.rs`, `Adding new files.`);
        benchContext.runTask(`git commit -m "${branchCommand}"`, `Committing changes.`);
        if (config.pushToken) {
            benchContext.runTask(`git push https://${config.pushToken}@github.com/${config.owner}/${config.repo}.git HEAD`, `Pushing commit with pushToken.`);
        } else {
            benchContext.runTask(`git push`, `Pushing commit.`);
        }

        let report = `Benchmark: **EVM**\n\n`
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
    benchEVM: benchEVM,
};
