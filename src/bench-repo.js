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

async function benchRepo(app, config){
    let command = config.extra.split(" ")[0];

    const supportedCommands = Object.keys(CustomRuntimeBenchmarkConfigs);

    if (!supportedCommands.includes(command)){
        return errorResult(`${command} is not supported command`)
    }

    let palletName = config.extra.split(" ").slice(1).join(" ").trim();

    if (!checkAllowedCharacters(palletName)) {
        return errorResult(`Not allowed to use #&|; in the command!`);
    }

    const manifestPath = process.env.MANIFEST_PATH || 'node/Cargo.toml';
    const benchOutput = process.env.BENCH_PALLET_OUTPUT_FILE || 'weights.rs';
    const hbsTemplate = process.env.BENCH_PALLET_HBS_TEMPLATE || '.maintain/pallet-weight-template.hbs';

    let commandConfig = CustomRuntimeBenchmarkConfigs[command];

    let cargoCommand = commandConfig.branchCommand;

    cargoCommand = cargoCommand.replace("{manifest_path}", manifestPath);
    cargoCommand = cargoCommand.replace("{bench_output}", benchOutput);
    cargoCommand = cargoCommand.replace("{hbs_template}", hbsTemplate);
    cargoCommand = cargoCommand.replace("{pallet_name}", palletName);

    const missing = checkRuntimeBenchmarkCommand(cargoCommand);

    if (missing.length > 0) {
        return errorResult(`Missing required flags: ${missing.toString()}`)
    }

    config["title"] = commandConfig.title;

    const benchContext = new BenchContext(app, config);

    benchContext.palletName = palletName;
    benchContext.benchOutput = benchOutput;

    return runBench(cargoCommand, benchContext);
}

async function cloneAndSync(context){
    let githubRepo = `https://github.com/${context.config.owner}/${context.config.repo}`;

    var {error} = context.runTask(`git clone ${githubRepo} ${context.temp_dir}`, `Cloning git repository ${githubRepo} ...`, false);

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

    let gitResult = await cloneAndSync(context);

    if (gitResult.error){
        return gitResult;
    }

    let { stdout, stderr, error } = context.runTask(command, `Benching branch: ${context.config.branch}...`);

    if (error){
        return errorResult(stderr, 'benchmark')
    }

    let output = command.includes("--output");

    // If `--output` is set, we commit the benchmark file to the repo
    if (output) {
        let palletFolder = context.palletName.split('_').join('-').trim();
        let weightsPath = `pallets/${palletFolder}/src/weights.rs`;
        let cmd = `mv ${context.benchOutput} ${weightsPath}`;

        context.runTask(cmd);

        context.runTask(`git add ${weightsPath}`, `Adding new files.`);
        context.runTask(`git commit -m "Weights update for ${context.palletName} pallet"`, `Committing changes.`);

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