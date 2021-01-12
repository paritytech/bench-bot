function errorResult(stderr, step) {
    return { error: true, step, stderr }
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

module.exports = {
    errorResult: errorResult,
    checkAllowedCharacters: checkAllowedCharacters,
    checkRuntimeBenchmarkCommand: checkRuntimeBenchmarkCommand
}


