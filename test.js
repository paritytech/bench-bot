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
        assert.equal(collector.metrics["Change: Native"], "0.00");
        assert.equal(collector.metrics["Change: Wasm"], "0.00");
    });

    it("Should iterate through metrics", async function() {
        var collector = new libCollector.Collector();
        await collector.CollectBaseCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");
        await collector.CollectBranchCriterionWasmNative("./criterion-files/import-block-with-ed25519-B-0003");

        assert((await collector.Report()).length > 100);
    });

})