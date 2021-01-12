const {BenchContext} = require("./bench-context");
const {checkRuntimeBenchmarkCommand} = require("./bench-helpers");
const {errorResult, checkAllowedCharacters} = require("./bench-helpers");

const CustomRuntimeBenchmarkConfigs = {
    "pallet": {
        title: "Benchmark Runtime Pallet",
        branchCommand: [
            'cargo run --release',
            '--features=runtime-benchmarks',
            '--manifest-path={manifest_path}',
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
            '--output={bench_output}',
            '--template={hbs_template}',
        ].join(' '),
    },
}

function getManifestPath(){
    return process.env.MANIFEST_PATH || 'node/Cargo.toml';
}

function getOutputTemplate(){
    return process.env.BENCH_PALLET_OUTPUT_FILE || 'weights.rs';
}

function getHBSTemplate(){
    return process.env.BENCH_PALLET_HBS_TEMPLATE || '.maintain/pallet-weight-template.hbs';
}

async function benchRepo(app, config){
    let command = config.extra.split(" ")[0];

    const supported_commands = Object.keys(CustomRuntimeBenchmarkConfigs);

    if (!supported_commands.includes(command)){
        return errorResult(`${command} is not supported command`)
    }

    let pallet_name = config.extra.split(" ").slice(1).join(" ").trim();

    if (!checkAllowedCharacters(pallet_name)) {
        return errorResult(`Not allowed to use #&|; in the command!`);
    }

    let manifest_path = getManifestPath();
    let bench_output = getOutputTemplate();
    let hbs_template = getHBSTemplate();

    let commandConfig = CustomRuntimeBenchmarkConfigs[command];

    let cargoCommand = commandConfig.branchCommand;

    cargoCommand = cargoCommand.replace("{manifest_path}", manifest_path);
    cargoCommand = cargoCommand.replace("{bench_output}", bench_output);
    cargoCommand = cargoCommand.replace("{hbs_template}", hbs_template);
    cargoCommand = cargoCommand.replace("{pallet_name}", pallet_name);

    let missing = checkRuntimeBenchmarkCommand(cargoCommand);

    if (missing.length > 0) {
        return errorResult(`Missing required flags: ${missing.toString()}`)
    }

    config["title"] = commandConfig.title;

    let benchContext = new BenchContext(app, config);

    benchContext.pallet_name = pallet_name;
    benchContext.bench_output = bench_output;

    return runBench(cargoCommand, benchContext);
}

async function clone_and_sync(context){
    let github_repo = `https://github.com/${context.config.owner}/${context.config.repo}`;

    var {error} = context.runTask(`git clone ${github_repo} ${context.temp_dir}`, `Cloning git repository ${github_repo} ...`, false);

    if (error) {
        context.app.log("Git clone failed, probably directory exists...");
    }

    var { stderr, error } = context.runTask(`git fetch`, "Doing git fetch...");

   if (error) return errorResult(stderr);

    // Checkout the custom branch
    var { error } = context.runTask(`git checkout ${context.config.branch}`, `Checking out ${context.config.branch}...`);

    if (error) {
        context.app.log("Git checkout failed, probably some dirt in directory... Will continue with git reset.");
    }

    var { error, stderr } = context.runTask(`git reset --hard origin/${context.config.branch}`, `Resetting ${context.config.branch} hard...`);
    if (error) return errorResult(stderr);

    // Merge master branch
    var { error, stderr } = context.runTask(`git merge origin/${context.config.baseBranch}`, `Merging branch ${context.config.baseBranch}`);

    if (error) return errorResult(stderr, "merge");

    if (context.config.pushToken) {
        context.runTask(`git push https://${context.config.pushToken}@github.com/${context.config.owner}/${context.config.repo}.git HEAD`, `Pushing merge with pushToken.`);
    } else {
        context.runTask(`git push`, `Pushing merge.`);
    }

    return true;
}

async function runBench(command, context){
    context.app.log(`Started runtime benchmark "${context.config.title}."`);

    // If there is a preparation command - run it first
    context.config.preparationCommand && context.runTask(context.config.preparationCommand, "Preparation command", false);

    context.createTempDir();

    let git_result = await clone_and_sync(context);

    if (git_result.error){
        return git_result;
    }

    let { stdout, stderr, error } = context.runTask(command, `Benching branch: ${context.config.branch}...`);

    if (error){
        return errorResult(stderr, 'benchmark')
    }

    let output = command.includes("--output");

    // If `--output` is set, we commit the benchmark file to the repo
    if (output) {
        let palletFolder = context.pallet_name.split('_').join('-').trim();
        let weightsPath = `pallets/${palletFolder}/src/weights.rs`;
        let cmd = `mv ${context.bench_output} ${weightsPath}`;

        context.runTask(cmd);

        context.runTask(`git add ${weightsPath}`, `Adding new files.`);
        context.runTask(`git commit -m "Weights update for ${context.pallet_name} pallet"`, `Committing changes.`);

        if (config.pushToken) {
            context.runTask(`git push https://${context.config.pushToken}@github.com/${context.config.owner}/${context.config.repo}.git HEAD`, `Pushing commit with pushToken.`);
        } else {
            context.runTask(`git push origin ${context.config.branch}`, `Pushing commit.`);
        }
    }

    return `Benchmark: **${context.config.title}**\n\n`
        + command
        + "\n\n<details>\n<summary>Results</summary>\n\n"
        + (stdout ? stdout : stderr)
        + "\n\n </details>";
}

module.exports = {
    benchRepo : benchRepo
}