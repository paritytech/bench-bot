const cp = require("child_process")
const path = require("path")

function errorResult(message, error) {
    return { isError: true, message, error }
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

        let stdout = "", stderr = "", error = false
        try {
          stdout = cp.execSync(cmd, { stdio: "pipe", shell: true }).toString()
        } catch (err) {
          error = true
          if (err.code) {
            app.log(`ops.. Something went wrong (error code ${error.code})`);
            stdout = err.stdout.toString()

            stderr = err.stderr.toString()
            if (stderr) {
              app.log(`stderr: ${stderr.trim()}`);
            }
          } else {
            app.log.error("Caught exception in command execution")
            app.log.error(err)
          }
        }

        return { stdout, stderr, error };
    }
}

//::node::import::native::sr25519::transfer_keep_alive::paritydb::small

var BenchConfigs = {
    "import": {
        title: "Import Benchmark (random transfers)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::medium --json'
    },
    "import/small": {
        title: "Import Benchmark (Small block (10tx) with random transfers)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::small --json'
    },
    "import/large": {
        title: "Import Benchmark (Large block (500tx) with random transfers)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::large --json'
    },
    "import/full-wasm": {
        title: "Import Benchmark (Full block with wasm, for weights validation)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::full --json'
    },
    "import/wasm": {
        title: "Import Benchmark via wasm (random transfers)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::medium --json'
    },
    "ed25519": {
        title: "Import Benchmark (random transfers, ed25519 signed)",
        benchCommand: 'cargo run --release -p node-bench --quiet -- node::import::native::ed25519::transfer_keep_alive::rocksdb::medium --json'
    }
}

const prepareBranch = async function(
  {
    contributor,
    owner,
    repo,
    branch,
    baseBranch,
    getPushDomain
  },
  {
    benchContext
  }
) {
  const gitDirectory = path.join(cwd, "git")
  shell.mkdir(gitDirectory)

  const repositoryPath = path.join(gitDirectory, repo)
  var { url } = await getPushDomain()
  benchContext.runTask(`git clone ${url}/${owner}/${repo} ${repositoryPath}`);
  shell.cd(repositoryPath)

  var { error } = benchContext.runTask(`git add . && git reset --hard HEAD`);
  if (error) return errorResult(stderr);

  var { error, stdout } = benchContext.runTask("git rev-parse HEAD");
  if (error) return errorResult(stderr);
  const detachedHead = stdout.trim()

  // Check out to the detached head so that any branch can be deleted
  var { error, stderr } = benchContext.runTask(`git checkout ${detachedHead}`);
  if (error) return errorResult(stderr);

  // Recreate PR remote
  benchContext.runTask(`git remote remove pr`);
  var { url } = await getPushDomain()
  var { error, stderr } = benchContext.runTask(`git remote add pr ${url}/${contributor}/${repo}.git`);
  if (error) return errorResult(`Failed to add remote reference to ${owner}/${repo}`);

  // Fetch and recreate the PR's branch
  benchContext.runTask(`git branch -D ${branch}`);
  var { error, stderr } = benchContext.runTask(`git fetch pr ${branch} && git checkout --track pr/${branch}`, `Checking out ${branch}...`);
  if (error) return errorResult(stderr);

  // Fetch and merge master
  var { error, stderr } = benchContext.runTask(`git pull origin ${baseBranch}`, `Merging branch ${baseBranch}`);
  if (error) return errorResult(stderr);
}

function benchBranch(app, config) {
    app.log("Waiting our turn to run benchBranch...")

    return mutex.runExclusive(async function () {
      try {
        if (config.repo != "substrate") {
            return errorResult("Node benchmarks only available on Substrate.")
        }

        var id = config.id
        var benchConfig = BenchConfigs[id];
        if (!benchConfig) {
          return errorResult(`Bench configuration for "${id}" was not found`)
        }

        const collector = new libCollector.Collector();
        var benchContext = new BenchContext(app, config);
        var { title, benchCommand } = benchConfig
        app.log(`Started benchmark "${title}."`);

        var error = await prepareBranch(config, { benchContext })
        if (error) return error

        var { stderr, error, stdout } = benchContext.runTask(benchCommand, `Benching branch ${config.branch}...`);
        if (error) return errorResult(stderr)

        await collector.CollectBranchCustomRunner(stdout);
        let output = await collector.Report();

        return {
          title,
          output,
          extraInfo: "",
          benchCommand
        };
      }
      catch (error) {
          return errorResult("Caught exception in benchBranch", error);
      }
    })
}

var SubstrateRuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Runtime Pallet",
        benchCommand: [
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
        title: "Runtime Substrate Pallet",
        benchCommand: [
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
        title: "Runtime Custom",
        benchCommand: 'cargo run --release --features runtime-benchmarks --manifest-path bin/node/cli/Cargo.toml -- benchmark',
    }
}

var PolkadotRuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Runtime Pallet",
        benchCommand: [
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
            '--output=./runtime/polkadot/src/weights/{output_file}',
        ].join(' '),
    },
    "polkadot": {
        title: "Runtime Polkadot Pallet",
        benchCommand: [
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
            '--output=./runtime/polkadot/src/weights/{output_file}',
        ].join(' '),
    },
    "kusama": {
        title: "Runtime Kusama Pallet",
        benchCommand: [
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
            '--output=./runtime/kusama/src/weights/{output_file}',
        ].join(' '),
    },
    "westend": {
        title: "Runtime Westend Pallet",
        benchCommand: [
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
            '--output=./runtime/westend/src/weights/{output_file}',
        ].join(' '),
    },
    "custom": {
        title: "Runtime Custom",
        benchCommand: 'cargo run --release --features runtime-benchmarks -- benchmark',
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

function benchmarkRuntime(app, config) {
    app.log("Waiting our turn to run benchmarkRuntime...")

    return mutex.runExclusive(async function () {
      try {
          if (config.extra.split(" ").length < 2) {
              return errorResult(`Incomplete command.`)
          }

          let command = config.extra.split(" ")[0];

          var benchConfig;
          if (config.repo == "substrate") {
              benchConfig = SubstrateRuntimeBenchmarkConfigs[command];
          } else if (config.repo == "polkadot") {
              benchConfig = PolkadotRuntimeBenchmarkConfigs[command];
          } else {
              return errorResult(`${config.repo} repo is not supported.`)
          }

          var extra = config.extra.split(" ").slice(1).join(" ").trim();

          if (!checkAllowedCharacters(extra)) {
              return errorResult(`Not allowed to use #&|; in the command!`);
          }

          // Append extra flags to the end of the command
          let benchCommand = benchConfig.benchCommand;
          if (command == "custom") {
              // extra here should just be raw arguments to add to the command
              benchCommand += " " + extra;
          } else {
              // extra here should be the name of a pallet
              benchCommand = benchCommand.replace("{pallet_name}", extra);
              // custom output file name so that pallets with path don't cause issues
              let outputFile = extra.includes("::") ? extra.replace("::", "_") + ".rs" : '';
              benchCommand = benchCommand.replace("{output_file}", outputFile);
              // pallet folder should be just the name of the pallet, without the leading
              // "pallet_" or "frame_", then separated with "-"
              let palletFolder = extra.split("_").slice(1).join("-").trim();
              benchCommand = benchCommand.replace("{pallet_folder}", palletFolder);
          }

          let missing = checkRuntimeBenchmarkCommand(benchCommand);
          if (missing.length > 0) {
              return errorResult(`Missing required flags: ${missing.toString()}`)
          }

          var benchContext = new BenchContext(app, config);
          var { title } = benchConfig
          app.log(`Started runtime benchmark "${title}."`);

          var error = await prepareBranch(config, { benchContext })
          if (error) return error

          var { stdout, stderr } = benchContext.runTask(benchCommand, `Benching runtime in branch ${config.branch}...`);
          let extraInfo = ""

          // If `--output` is set, we commit the benchmark file to the repo
          if (benchCommand.includes("--output")) {
              const regex = /--output(?:=|\s+)(".+?"|\S+)/;
              const path = benchCommand.match(regex)[1];
              benchContext.runTask(`git add ${path}`);
              benchContext.runTask(`git commit -m "${benchCommand}"`);

              const target = `${config.contributor}/${config.repo}`
              const { url, token } = await config.getPushDomain()

              try {
                benchContext.runTask(`git remote set-url pr ${url}/${target}.git`, "Setting up remote for PR");
                benchContext.runTask(`git push pr HEAD`);
              } catch (error) {
                extraInfo = `NOTE: Failed to push commits to repository: ${error.toString().replace(token, "{secret}", "g")}`
              }
          }

          return {
            title,
            output: stdout ? stdout : stderr,
            extraInfo,
            benchCommand
          }
      }
      catch (error) {
          return errorResult("Caught exception in benchmarkRuntime", error);
      }
    })
}

module.exports = {
    benchBranch: benchBranch,
    benchmarkRuntime: benchmarkRuntime,
};
