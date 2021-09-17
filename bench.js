const path = require("path")
const fs = require("fs")
const Mutex = require("async-mutex").Mutex
const libCollector = require("./collector")

function errorResult(message, error) {
  return { isError: true, message, error }
}

const mutex = new Mutex()

//::node::import::native::sr25519::transfer_keep_alive::paritydb::small

var BenchConfigs = {
  import: {
    title: "Import Benchmark (random transfers)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::medium --json",
  },
  "import/small": {
    title: "Import Benchmark (Small block (10tx) with random transfers)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::small --json",
  },
  "import/large": {
    title: "Import Benchmark (Large block (500tx) with random transfers)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::native::sr25519::transfer_keep_alive::rocksdb::large --json",
  },
  "import/full-wasm": {
    title: "Import Benchmark (Full block with wasm, for weights validation)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::full --json",
  },
  "import/wasm": {
    title: "Import Benchmark via wasm (random transfers)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::wasm::sr25519::transfer_keep_alive::rocksdb::medium --json",
  },
  ed25519: {
    title: "Import Benchmark (random transfers, ed25519 signed)",
    benchCommand:
      "cargo run --quiet --release -p node-bench --quiet -- node::import::native::ed25519::transfer_keep_alive::rocksdb::medium --json",
  },
}

const prepareBranch = async function (
  { contributor, owner, repo, branch, baseBranch, getPushDomain },
  { runner },
) {
  const gitDirectory = path.join(__dirname, "git")
  const repositoryPath = path.join(gitDirectory, repo)

  var { url } = await getPushDomain()
  await runner.run(
    `mkdir -p ${gitDirectory}; git clone ${url}/${owner}/${repo} ${repositoryPath}; cd ${repositoryPath}`,
  )

  var { error, stderr } = await runner.run("git add . && git reset --hard HEAD")
  if (error) return errorResult(stderr)

  var { error, stdout, stderr } = await runner.run("git rev-parse HEAD")
  if (error) return errorResult(stderr)
  const detachedHead = stdout.trim()

  // Check out to the detached head so that any branch can be deleted
  var { error, stderr } = await runner.run(`git checkout ${detachedHead}`)
  if (error) return errorResult(stderr)

  // Recreate PR remote
  await runner.run("git remote remove pr")
  var { url } = await getPushDomain()
  var { error, stderr } = await runner.run(
    `git remote add pr ${url}/${contributor}/${repo}.git`,
  )
  if (error)
    return errorResult(`Failed to add remote reference to ${owner}/${repo}`)

  // Fetch and recreate the PR's branch
  await runner.run(`git branch -D ${branch}`)
  var { error, stderr } = await runner.run(
    `git fetch pr ${branch} && git checkout --track pr/${branch}`,
    `Checking out ${branch}...`,
  )
  if (error) return errorResult(stderr)

  // Fetch and merge master
  var { error, stderr } = await runner.run(
    `git pull origin ${baseBranch}`,
    `Merging branch ${baseBranch}`,
  )
  if (error) return errorResult(stderr)
}

function benchBranch(runner, config) {
  runner.log("Waiting our turn to run benchBranch...")

  return mutex.runExclusive(async function () {
    try {
      if (config.repo != "substrate") {
        return errorResult("Node benchmarks only available on Substrate.")
      }

      var id = config.id
      var benchConfig = BenchConfigs[id]
      if (!benchConfig) {
        return errorResult(`Bench configuration for "${id}" was not found`)
      }

      const collector = new libCollector.Collector()
      var { title, benchCommand } = benchConfig
      runner.log(`Started benchmark "${title}."`)

      var error = await prepareBranch(config, { runner })
      if (error) return error

      var { stderr, error, stdout } = await runner.run(
        benchCommand,
        `Benching branch ${config.branch}...`,
      )
      if (error) return errorResult(stderr)

      await collector.CollectBranchCustomRunner(stdout)
      let output = await collector.Report()

      return { title, output, extraInfo: "", benchCommand }
    } catch (error) {
      return errorResult("Caught exception in benchBranch", error)
    }
  })
}

var SubstrateRuntimeBenchmarkConfigs = {
  pallet: {
    title: "Runtime Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--manifest-path=bin/node/cli/Cargo.toml",
      "--",
      "benchmark",
      "--chain=dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--output=./frame/{pallet_folder}/src/weights.rs",
      "--template=./.maintain/frame-weight-template.hbs",
    ].join(" "),
  },
  substrate: {
    title: "Runtime Substrate Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--manifest-path=bin/node/cli/Cargo.toml",
      "--",
      "benchmark",
      "--chain=dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--output=./frame/{pallet_folder}/src/weights.rs",
      "--template=./.maintain/frame-weight-template.hbs",
    ].join(" "),
  },
  custom: {
    title: "Runtime Custom",
    benchCommand:
      "cargo run --quiet --release --features runtime-benchmarks --manifest-path bin/node/cli/Cargo.toml -- benchmark",
  },
}

var PolkadotRuntimeBenchmarkConfigs = {
  pallet: {
    title: "Runtime Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=polkadot-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--output=./runtime/polkadot/src/weights/{output_file}",
    ].join(" "),
  },
  polkadot: {
    title: "Runtime Polkadot Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=polkadot-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--output=./runtime/polkadot/src/weights/{output_file}",
    ].join(" "),
  },
  kusama: {
    title: "Runtime Kusama Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=kusama-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--output=./runtime/kusama/src/weights/{output_file}",
    ].join(" "),
  },
  westend: {
    title: "Runtime Westend Pallet",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=westend-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--output=./runtime/westend/src/weights/{output_file}",
    ].join(" "),
  },
  custom: {
    title: "Runtime Custom",
    benchCommand:
      "cargo run --quiet --release --features runtime-benchmarks -- benchmark",
  },
}

var PolkadotXcmBenchmarkConfigs = {
  pallet: {
    title: "XCM",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=polkadot-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--template=./xcm/pallet-xcm-benchmarks/template.hbs",
      "--output=./runtime/polkadot/src/weights/xcm/{output_file}",
    ].join(" "),
  },
  polkadot: {
    title: "Polkadot XCM",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=polkadot-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--template=./xcm/pallet-xcm-benchmarks/template.hbs",
      "--output=./runtime/polkadot/src/weights/xcm/{output_file}",
    ].join(" "),
  },
  kusama: {
    title: "Kusama XCM",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=kusama-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--template=./xcm/pallet-xcm-benchmarks/template.hbs",
      "--output=./runtime/kusama/src/weights/xcm/{output_file}",
    ].join(" "),
  },
  westend: {
    title: "Westend XCM",
    benchCommand: [
      "cargo run --quiet --release",
      "--features=runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=westend-dev",
      "--steps=50",
      "--repeat=20",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      "--header=./file_header.txt",
      "--template=./xcm/pallet-xcm-benchmarks/template.hbs",
      "--output=./runtime/westend/src/weights/xcm/{output_file}",
    ].join(" "),
  },
  custom: {
    title: "XCM Custom",
    benchCommand:
      "cargo run --quiet --release --features runtime-benchmarks -- benchmark",
  },
}

function checkRuntimeBenchmarkCommand(command) {
  let required = [
    "benchmark",
    "--pallet",
    "--extrinsic",
    "--execution",
    "--wasm-execution",
    "--steps",
    "--repeat",
    "--chain",
  ]
  let missing = []
  for (const flag of required) {
    if (!command.includes(flag)) {
      missing.push(flag)
    }
  }

  return missing
}

function checkAllowedCharacters(command) {
  let banned = ["#", "&", "|", ";"]
  for (const token of banned) {
    if (command.includes(token)) {
      return false
    }
  }

  return true
}

function benchmarkRuntime(runner, config) {
  runner.log("Waiting our turn to run benchmarkRuntime...")

  return mutex.runExclusive(async function () {
    try {
      if (config.extra.split(" ").length < 2) {
        return errorResult(`Incomplete command.`)
      }

      let command = config.extra.split(" ")[0]

      var benchConfig
      if (config.repo == "substrate" && config.id == "runtime") {
        benchConfig = SubstrateRuntimeBenchmarkConfigs[command]
      } else if (config.repo == "polkadot" && config.id == "runtime") {
        benchConfig = PolkadotRuntimeBenchmarkConfigs[command]
      } else if (config.repo == "polkadot" && config.id == "xcm") {
        benchConfig = PolkadotXcmBenchmarkConfigs[command]
      } else {
        return errorResult(
          `${config.repo} repo with ${config.id} is not supported.`,
        )
      }

      var extra = config.extra.split(" ").slice(1).join(" ").trim()

      if (!checkAllowedCharacters(extra)) {
        return errorResult(`Not allowed to use #&|; in the command!`)
      }

      // Append extra flags to the end of the command
      let benchCommand = benchConfig.benchCommand
      if (command == "custom") {
        // extra here should just be raw arguments to add to the command
        benchCommand += " " + extra
      } else {
        // extra here should be the name of a pallet
        benchCommand = benchCommand.replace("{pallet_name}", extra)
        // custom output file name so that pallets with path don't cause issues
        let outputFile = extra.includes("::")
          ? extra.replace("::", "_") + ".rs"
          : ""
        benchCommand = benchCommand.replace("{output_file}", outputFile)
        // pallet folder should be just the name of the pallet, without the leading
        // "pallet_" or "frame_", then separated with "-"
        let palletFolder = extra.split("_").slice(1).join("-").trim()
        benchCommand = benchCommand.replace("{pallet_folder}", palletFolder)
      }

      let missing = checkRuntimeBenchmarkCommand(benchCommand)
      if (missing.length > 0) {
        return errorResult(`Missing required flags: ${missing.toString()}`)
      }

      var { title } = benchConfig
      runner.log(
        `Started ${config.id} benchmark "${title}" (command: ${benchCommand})`,
      )

      var error = await prepareBranch(config, { runner })
      if (error) return error

      const outputFile = benchCommand.match(/--output(?:=|\s+)(".+?"|\S+)/)[1]
      var { stdout, stderr, error } = await runner.run(
        benchCommand,
        `Running for branch ${config.branch}, ${
          outputFile ? `outputFile: ${outputFile}` : ""
        }: ${benchCommand}`,
      )
      if (error) {
        return errorResult(stderr)
      }

      let extraInfo = ""

      var { stdout: gitStatus, stderr: gitStatusError } = await runner.run(
        "git status --short",
      )
      runner.log(`Git status after execution: ${gitStatus || gitStatusError}`)

      if (outputFile) {
        if (process.env.DEBUG) {
          runner.log({
            context: "Output file",
            msg: fs.readFileSync(outputFile).toString(),
          })
        } else {
          try {
            var last = await runner.run(
              `git add ${outputFile} && git commit -m "${benchCommand}"`,
            )
            if (last.error) {
              extraInfo = `ERROR: Unable to commit file ${outputFile}`
              runner.logFatalError(
                { stdout: last.stdout, stderr: last.stderr },
                extraInfo,
              )
            } else {
              const target = `${config.contributor}/${config.repo}`
              const { url, token } = await config.getPushDomain()
              var last = await runner.run(
                `git remote set-url pr ${url}/${target}.git && git push pr HEAD`,
                `Pushing ${outputFile} to ${config.branch}`,
              )
              if (last.error) {
                extraInfo = `ERROR: Unable to push ${outputFile}`
                runner.logFatalError(
                  { stdout: last.stdout, stderr: last.stderr },
                  extraInfo,
                )
              }
            }
          } catch (error) {
            extraInfo =
              "NOTE: Caught exception while trying to push commits to the repository"
            runner.logFatalError(error, extraInfo)
          }
        }
      }

      return { title, output: stdout || stderr, extraInfo, benchCommand }
    } catch (error) {
      return errorResult("Caught exception in benchmarkRuntime", error)
    }
  })
}

module.exports = {
  benchBranch: benchBranch,
  benchmarkRuntime: benchmarkRuntime,
}
