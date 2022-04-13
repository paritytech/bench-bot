const cp = require("child_process")
const path = require("path")
const fs = require("fs")

function errorResult(message, error) {
  return { isError: true, message, error }
}

let cwd = process.cwd()

const Mutex = require("async-mutex").Mutex
const mutex = new Mutex()
var shell = require("shelljs")

var libCollector = require("./collector")

// really just a context for running processes from a shell...
function BenchContext(app, config) {
  var self = this
  self.app = app
  self.config = config

  self.runTask = function (cmd, title) {
    let stdout = "",
      stderr = "",
      error = true

    console.log(`BenchContext.runTask(): ${cmd}`);

    try {
      if (title) {
        app.log({ title, msg: `Running task on directory ${process.cwd()}` })
      }
      // We prefer to run the command in a synchronously so that there's less
      // risk of having the Node.js process interfere or deprioritize the
      // process' execution.
      // Previously we've used cp.spawn for capturing the processes' streams
      // but, again, having it execute directly in the shell reduces the
      // likelihood of friction or overhead due to Node.js APIs.
      const result = shell.exec(cmd, { silent: false })
      stderr = result.stderr
      error = result.code !== 0
      stdout = result.stdout
    } catch (err) {
      error = true
      app.log.fatal({
        msg: "Caught exception in command execution",
        error: err,
      })
    }

    return { stdout, stderr, error }
  }
}

//::node::import::native::sr25519::transfer_keep_alive::paritydb::small

// const cargoRun = "cargo run --features=runtime-benchmarks --bin moonbeam -- ";
const cargoRun = "cargo run ";

var BenchConfigs = {
  ed25519: {
    title: "Import Benchmark (random transfers, ed25519 signed)",
    benchCommand:
      cargoRun + "benchmark --chain dev --execution=native --pallet \"*\" --extrinsic \"*\" --steps 32 --repeat 8 --json --record-proof"
  },
}

const prepareBranch = async function (
  { contributor, owner, repo, bbRepo, bbRepoOwner, branch, baseBranch, getPushDomain, getBBPushDomain, },
  { benchContext },
) {
  const gitDirectory = path.join(cwd, "git")
  shell.mkdir(gitDirectory)

  const repositoryPath = path.join(gitDirectory, repo)
  var { url } = await getPushDomain()
  console.log(`push domain: ${url}`);
  var { error, stderr } = benchContext.runTask(`git clone ${url}/${owner}/${repo} ${repositoryPath}`);
  if (error) {
    // if dest path has a .git dir, ignore
    // this error handling prevents subsequent git commands from interacting with the wrong repo
    if (! shell.test('-d', repositoryPath + '/.git')) {
      return errorResult(stderr)
    }
  }

  shell.cd(repositoryPath)

  var { error, stderr } = benchContext.runTask("git submodule update --init")
  if (error) return errorResult(stderr)

  var { error } = benchContext.runTask("git add . && git reset --hard HEAD")
  if (error) return errorResult(stderr)

  var { error, stdout } = benchContext.runTask("git rev-parse HEAD")
  if (error) return errorResult(stderr)
  const detachedHead = stdout.trim()

  // Check out to the detached head so that any branch can be deleted
  var { error, stderr } = benchContext.runTask(`git checkout ${detachedHead}`)
  if (error) return errorResult(stderr)

  // Recreate PR remote
  benchContext.runTask("git remote remove original_pr_repo")
  var { url } = await getPushDomain()
  var { error, stderr } = benchContext.runTask(
    `git remote add original_pr_repo ${url}/${contributor}/${repo}.git`,
  )
  if (error)
    return errorResult(`Failed to add remote reference to ${owner}/${repo}`)

  var bbUrl = (await getBBPushDomain()).url;
  benchContext.runTask("git remote remove bb_pr_repo")
  var { error, stderr } = benchContext.runTask(
    `git remote add bb_pr_repo ${bbUrl}/${bbRepoOwner}/${bbRepo}.git`,
  )
  if (error)
    return errorResult(`Failed to add remote reference to ${owner}/${repo}`)

  // Fetch and recreate the PR's branch
  benchContext.runTask(`git branch -D ${branch}`)
  var { error, stderr } = benchContext.runTask(
    `git fetch original_pr_repo ${branch} && git checkout --track original_pr_repo/${branch}`,
    `Checking out ${branch}...`,
  )
  if (error) return errorResult(stderr)

  // Fetch and merge master
  // TODO: why merge master here...?
  //       but also: why does this fail sometimes?
  /*
  var { error, stderr } = benchContext.runTask(
    `git pull origin ${baseBranch}`,
    `Merging branch ${baseBranch}`,
  )
  if (error) return errorResult(stderr)
  */
}

function benchBranch(app, config) {
  app.log("Waiting our turn to run benchBranch...")

  return mutex.runExclusive(async function () {
    try {
      if (config.repo != "moonbeam") {
        return errorResult("Node benchmarks only available on Moonbeam.")
      }

      console.log(`config id: ${config.id}`);

      var id = config.id
      var benchConfig = BenchConfigs[id]
      if (!benchConfig) {
        return errorResult(`Bench configuration for "${id}" was not found`)
      }

      console.log(`bench command: ${benchConfig.benchCommand}`);

      const collector = new libCollector.Collector()
      var benchContext = new BenchContext(app, config)
      var { title, benchCommand } = benchConfig
      app.log(`Started benchmark "${title}."`)

      var error = await prepareBranch(config, { benchContext })
      if (error) return error

      var { stderr, error, stdout } = benchContext.runTask(
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

var MoonbeamRuntimeBenchmarkConfigs = {
  pallet: {
    title: "Runtime Pallet",
    benchCommand: [
      cargoRun,
      "--release",
      "--bin moonbeam",
      "--features=runtime-benchmarks,moonbase-runtime-benchmarks",
      "--",
      "benchmark",
      "--chain=dev",
      "--steps=1",
      "--repeat=1",
      "--pallet={pallet_name}",
      '--extrinsic="*"',
      "--execution=wasm",
      "--wasm-execution=compiled",
      "--heap-pages=4096",
      // "--header=./file_header.txt",
      "--template=./benchmarking/frame-weight-template.hbs",
      "--output=./pallets/{pallet_folder}/src/weights.rs",
    ].join(" "),
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

// Moonbeam's pallet naming is inconsistent in several ways:
// * the prefix "pallet-" being included or not in the crate name
// * pallet's dir name (maybe?)
// * where pallets are benchmarked (in their own repo or not)
//
// This function serves as a registry for all of this information.
function matchMoonbeamPallet(palletIsh) {
  switch(palletIsh) {

    // "companion"
    case "crowdloan-rewards":
      return {
        name: "crowdloan-rewards",
        benchmark: "pallet_crowdloan_rewards",
        dir: "", // TODO: how can this be included in the moonbeam codebase?
      };

    // found directly in the moonbeam repo
    case "parachain-staking":
      return {
        name: "parachain-staking",
        benchmark: "parachain_staking",
        dir: "parachain-staking",
      };
    case "author-mapping":
      return {
        name: "author-mapping",
        benchmark: "pallet_author_mapping",
        dir: "author-mapping",
      };
    case "asset-manager":
      return {
        name: "asset-manager",
        benchmark: "pallet_asset_manager",
        dir: "asset-manager",
      };
  }

  throw new Error(`Pallet argument not recognized: ${palletIsh}`);
}

function benchmarkRuntime(app, config, octokit) {
  app.log("Waiting our turn to run benchmarkRuntime...")

  return mutex.runExclusive(async function () {
    try {
      if (config.extra.split(" ").length < 2) {
        return errorResult(`Incomplete command.`)
      }

      let [command, ...extra] = config.extra.split(" ")
      extra = extra.join(" ").trim();

      var benchConfig

      // XXX: testing
      const repo = config.repo.startsWith("moonbeam") ? "moonbeam" : config.repo;

      if (repo == "moonbeam" && config.id == "runtime") {
        benchConfig = MoonbeamRuntimeBenchmarkConfigs[command]
      } else {
        return errorResult(
          `${config.repo} repo with ${config.id} is not supported.`,
        )
      }

      if (!checkAllowedCharacters(extra)) {
        return errorResult(`Not allowed to use #&|; in the command!`)
      }

      // Append extra flags to the end of the command
      console.log(`********************** replacing {pallet_folder}, extra: ${extra}`);
      let benchCommand = benchConfig.benchCommand
      if (command == "custom") {
        // extra here should just be raw arguments to add to the command
        benchCommand += " " + extra
      } else {
        let palletInfo = matchMoonbeamPallet(extra);

        // extra here should be the name of a pallet
        benchCommand = benchCommand.replace("{pallet_name}", palletInfo.benchmark)
        // custom output file name so that pallets with path don't cause issues
        /*
         * TODO: what is this doing?
        let outputFile = extra.includes("::")
          ? extra.replace("::", "_") + ".rs"
          : ""
        */
        benchCommand = benchCommand.replace("{output_file}", extra)
        /*
         * TODO: understand this and how it relates to moonbeam...
         *
        // pallet folder should be just the name of the pallet, without the leading
        // "pallet_" or "frame_", then separated with "-"
        // let palletFolder = extra.split("_").slice(1).join("-").trim()
        let palletFolder = extra;
        console.log(`calculated palletFolder: ${palletFolder}`);
        */
        benchCommand = benchCommand.replace("{pallet_folder}", palletInfo.dir)
      }

      let missing = checkRuntimeBenchmarkCommand(benchCommand)
      if (missing.length > 0) {
        return errorResult(`Missing required flags: ${missing.toString()}`)
      }

      var benchContext = new BenchContext(app, config)
      var { title } = benchConfig
      app.log(
        `Started ${config.id} benchmark "${title}." (command: ${benchCommand})`,
      )

      var error = await prepareBranch(config, { benchContext })
      if (error) return error

      const outputFile = benchCommand.match(/--output(?:=|\s+)(".+?"|\S+)/)[1]
      console.log(`outputFile: ${outputFile}`);
      var { stdout, stderr } = benchContext.runTask(
        benchCommand,
        `Running for branch ${config.branch}, ${outputFile ? `outputFile: ${outputFile}` : ""
        }: ${benchCommand}`,
      )
      let extraInfo = ""

      var { stdout: gitStatus, stderr: gitStatusError } =
        benchContext.runTask("git status --short")
      app.log(`Git status after execution: ${gitStatus || gitStatusError}`)

      if (outputFile) {
        if (process.env.DEBUG) {
          app.log({
            context: "Output file",
            msg: fs.readFileSync(outputFile).toString(),
          })
        } else {
          try {
            var last = benchContext.runTask(
              `git add ${outputFile} && git commit -m "${benchCommand}"`,
            )
            if (last.error) {
              extraInfo = `ERROR: Unable to commit file ${outputFile}`
              app.log.fatal({
                msg: extraInfo,
                stdout: last.stdout,
                stderr: last.stderr,
              })
            } else {
              const { url, token } = await config.getBBPushDomain()
              // TODO: a unique branch should be used to avoid conflicts
              var last = benchContext.runTask(
                `git remote set-url bb_pr_repo ${url}/${config.bbRepoOwner}/${config.bbRepo}.git && git push bb_pr_repo HEAD`,
                `Pushing ${outputFile} to ${config.branch}`,
              )
              if (last.error) {
                extraInfo = `ERROR: Unable to push ${outputFile}`
                app.log.fatal({
                  msg: extraInfo,
                  stdout: last.stdout,
                  stderr: last.stderr,
                })
              }

            }
          } catch (error) {
            extraInfo =
              "NOTE: Caught exception while trying to push commits to the repository"
            app.log.fatal({ msg: extraInfo, error })
          }

          try {

            await octokit.pulls.create({
              owner: config.bbRepoOwner,
              repo: config.bbRepo,
              title: "Updated Weights",
              head: `${config.bbRepoOwner}:${config.branch}`, // TODO: may need tweaking (provide git hash?)
              base: config.branch,
              body: `Weights have been updated`, // TODO
              maintainer_can_modify: true,

            })
          } catch (error) {
            extraInfo =
              "NOTE: Caught exception while trying to create pull request"
            app.log.fatal({ msg: extraInfo, error })
          }
        }
      }

      return {
        title,
        output: stdout ? stdout : stderr,
        extraInfo,
        benchCommand,
      }
    } catch (error) {
      return errorResult("Caught exception in benchmarkRuntime", error)
    }
  })
}

function benchRustup(app, config) {
  app.log("Waiting our turn to run benchRustup...")

  return mutex.runExclusive(async function () {
    try {

      // right now only `rustup update` is supported.
      if (config.extra != "update") {
        return errorResult(`Invalid "rustup" command. Only "update" is supported.`)
      }

      const collector = new libCollector.Collector()
      var benchContext = new BenchContext(app, config)

      let benchCommand = "rustup update";
      let title = "Rustup Update";

      var { stderr, error, stdout } = benchContext.runTask(
        benchCommand,
        `Executing "rustup update"...`,
      )
      if (error) return errorResult(stderr)

      return {
        title,
        output: stdout ? stdout : stderr,
        extraInfo: "",
        benchCommand
      }
    } catch (error) {
      return errorResult("Caught exception in benchRustup", error)
    }
  })
}

module.exports = {
  benchmarkRuntime: benchmarkRuntime,
  benchRustup: benchRustup,
}
