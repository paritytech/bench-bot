var assert = require('assert');
var ui = require("./ui");

describe("UI", function() {

    it("Should grab input from import bench run result", function() {

        var stdout = `

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
`

        var expectedGrabbed = `
import block/Wasm time:
 [80.670 ms **87.071 ms** 101.30 ms]
change:
 [+26.063% **+47.439%** +68.633%] (p = 0.00 < 0.05)
Performance has regressed.`

        var grabbed = ui.importGrabber(stdout);

        assert.equal(grabbed, expectedGrabbed);

    });

    it("Should grab output from ed25519 bench", function() {

        let stdout = `
running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

     Running target/release/deps/import-08cad66314b85c09
Gnuplot not found, using plotters backend
2020-02-27 16:42:19 Initializing Genesis block/state (state: 0xd18f…407b, header-hash: 0xed35…e110)
2020-02-27 16:42:22 Block construction: 1.479992203s (101 tx)
2020-02-27 16:42:22 Not registering Substrate logger, as there is already a global logger registered!
2020-02-27 16:42:23 Initializing Genesis block/state (state: 0xd18f…407b, header-hash: 0xed35…e110)
2020-02-27 16:42:24 Block construction: 1.364895882s (101 tx)
2020-02-27 16:42:24 Not registering Substrate logger, as there is already a global logger registered!
2020-02-27 16:42:25 Initializing Genesis block/state (state: 0x47da…d5e6, header-hash: 0x235d…3a0f)
2020-02-27 16:42:26 Block construction: 1.427581069s (101 tx)
Benchmarking ed25519 B-0003/Wasm: Warming up for 20.000 s
Warning: Unable to complete 50 samples in 5.0s. You may wish to increase target time to 286.5s or reduce sample count to 10.
ed25519 B-0003/Wasm     time:   [131.13 ms 133.95 ms 136.34 ms]
                        change: [+0.3751% +9.2071% +18.870%] (p = 0.04 < 0.05)
                        Change within noise threshold.
Benchmarking ed25519 B-0003/Native: Warming up for 20.000 s
Warning: Unable to complete 50 samples in 5.0s. You may wish to increase target time to 166.9s or reduce sample count to 10.
ed25519 B-0003/Native   time:   [45.089 ms 47.407 ms 49.940 ms]
                        change: [+28.753% +34.019% +40.240%] (p = 0.00 < 0.05)
                        Performance has regressed.
Found 1 outliers among 50 measurements (2.00%)
  1 (2.00%) high mild

2020-02-27 16:51:21 Not registering Substrate logger, as there is already a global logger registered!
2020-02-27 16:51:22 Initializing Genesis block/state (state: 0x8b42…f12b, header-hash: 0x62ac…ef15)
2020-02-27 16:51:23 Block construction: 1.223601248s (101 tx)
`

        var expectedGrabbed = `ed25519 B-0003/Wasm     time:
   [131.13 ms **133.95 ms** 136.34 ms]
change:
 [+0.3751% **+9.2071%** +18.870%] (p = 0.04 < 0.05)
ed25519 B-0003/Native   time:
   [45.089 ms **47.407 ms** 49.940 ms]
change:
 [+28.753% **+34.019%** +40.240%] (p = 0.00 < 0.05)
Performance has regressed.`

        var grabbed = ui.importGrabber(stdout);

        assert.equal(grabbed, expectedGrabbed);

    });

})