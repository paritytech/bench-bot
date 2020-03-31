var assert = require('assert');
var libCollector = require("./collector");

describe("Collector", function() {

    it("Should collect import run results", async function() {
        var collector = new libCollector.Collector();
        await collector.CollectBaseCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");
        await collector.CollectBranchCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");

        assert.equal(collector.metrics["Master: Wasm"], "134.94 ms (+/- 1.64 ms)");
        assert.equal(collector.metrics["Master: Native"], "42.36 ms (+/- 1.27 ms)");
        assert.equal(collector.metrics["Branch: Wasm"], "134.94 ms (+/- 1.64 ms)");
        assert.equal(collector.metrics["Branch: Native"], "42.36 ms (+/- 1.27 ms)");
        assert.equal(collector.metrics["Change: Native"], "0.00%");
        assert.equal(collector.metrics["Change: Wasm"], "0.00%");
    });

    it("Should iterate through metrics", async function() {
        var collector = new libCollector.Collector();
        await collector.CollectBaseCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");
        await collector.CollectBranchCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");

        assert((await collector.Report()).length > 100);
    });

    it("Shoud parse json stdout", async function() {
        var collector = new libCollector.Collector();

        await collector.CollectBaseCustomRunner(`[{"name":"Import benchmark (random transfers, wasm)","raw_average":73361870,"average":70916310}]`);
        await collector.CollectBranchCustomRunner(`[{"name":"Import benchmark (random transfers, wasm)","raw_average":73361870,"average":60916310}]`);

        assert.equal(collector.metrics["Change"], "-14.10%");
        assert.equal(collector.metrics["Branch"], "60.92 ms");
        assert.equal(collector.metrics["Master"], "70.92 ms");
    });

})