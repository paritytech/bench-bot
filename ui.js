
/*

This input:

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

Gnuplot not found, using plotters backend
Benchmarking import block/Wasm
Benchmarking import block/Wasm: Warming up for 3.0000 s

Warning: Unable to complete 10 samples in 5.0s. You may wish to increase target time to 48.2s.
Benchmarking import block/Wasm: Collecting 10 samples in estimated 48.213 s (55 iterations)
Benchmarking import block/Wasm: Analyzing
import block/Wasm time: [80.670 ms 87.071 ms 101.30 ms]
change: [+26.063% +47.439% +68.633%] (p = 0.00 < 0.05)
Performance has regressed.
Benchmarking import block/Native
Benchmarking import block/Native: Warming up for 3.0000 s

Warning: Unable to complete 10 samples in 5.0s. You may wish to increase target time to 20.3s.
Benchmarking import block/Native: Collecting 10 samples in estimated 20.314 s (55 iterations)
Benchmarking import block/Native: Analyzing
import block/Native time: [25.134 ms 25.585 ms 26.032 ms]
change: [-0.1846% +3.2220% +6.5849%] (p = 0.09 > 0.05)
No change in performance detected.

Should be tranformed to this output:

import block/Wasm time:
[80.670 ms **87.071 ms** 101.30 ms]
change:
[+26.063% **+47.439%** +68.633%] (p = 0.00 < 0.05)
Performance has regressed.

*/

function importGrabber(stdout)  {
    let out = stdout.match(/import block(.*) time: (.*)|change:(.*)|No change in performance detected.|Performance has(.*)/g);

    for (var i = 0; i < out.length; i++) {
        out[i] = out[i].replace(/ [0-9]+\.[0-9]+ ms | (\+|\-)[0-9]+\.[0-9]+% /, function(val) { return " **" + val.trim() + "** "; });
        out[i] = out[i].replace(" time:", " time:\n");
        out[i] = out[i].replace("change:", "change:\n");
        out[i] = out[i].replace("import block", "\nimport block");
    }

    return out.join("\n");
}

function format(bench) {
    const { masterResult, branchResult } = bench;

    const masterHeader = "===== MASTER RESULT ======";
    const branchHeader = "===== BRANCH RESULT ======";

    const results = [
      masterHeader,
      importGrabber(masterResult),
      "",
      branchHeader,
      importGrabber(branchResult),
    ].join("\n");

    return results;
}

module.exports.importGrabber = importGrabber;
module.exports.format = format;