const fs = require('fs')

var Collector = function() {
    var self = this;
    self.metrics = {};
    self.baseNative  = 0.0;
    self.baseWasm = 0.0;

    self.FormatMs = function(fl) {
        return (fl/1000000.0).toFixed(2);
    }

    self.FormatPc = function(fl) {
        return (fl > 0 ? "+" : "") + (fl*100).toFixed(2) + '%';
    }

    self.CollectBaseCriterionWasmNative = async function(baseDir) {
        var masterNativeStats = await self.loadStats(baseDir + "/Native/base/estimates.json");
        var masterWasmStats = await self.loadStats(baseDir + "/Wasm/base/estimates.json");

        self.baseWasm = masterWasmStats.Median.point_estimate;
        self.baseNative = masterNativeStats.Median.point_estimate

        self.metrics["Master: Wasm"] = `${self.FormatMs(self.baseWasm)} ms (+/- ${self.FormatMs(masterWasmStats.Median.standard_error)} ms)`;
        self.metrics["Master: Native"] = `${self.FormatMs(self.baseNative)} ms (+/- ${self.FormatMs(masterNativeStats.Median.standard_error)} ms)`;
    }

    self.CollectBranchCriterionWasmNative = async function(baseDir) {
        var branchNativeStats = await self.loadStats(baseDir + "/Native/new/estimates.json");
        var branchWasmStats = await self.loadStats(baseDir + "/Wasm/new/estimates.json");

        var branchWasm = branchWasmStats.Median.point_estimate;
        var branchNative = branchNativeStats.Median.point_estimate;

        self.metrics["Branch: Wasm"] = `${self.FormatMs(branchWasm)} ms (+/- ${self.FormatMs(branchWasmStats.Median.standard_error)} ms)`;
        self.metrics["Branch: Native"] = `${self.FormatMs(branchNative)} ms (+/- ${self.FormatMs(branchNativeStats.Median.standard_error)} ms)`;

        var changeWasm = (branchWasm - self.baseWasm) / self.baseWasm;
        var changeNative = (branchNative - self.baseNative) / self.baseNative;

        self.metrics["Change: Wasm"] = self.FormatPc(changeWasm);
        self.metrics["Change: Native"] = self.FormatPc(changeNative);
    }

    self.CollectBaseCustomRunner = async function(stdout) {
        self.baseNative = JSON.parse(stdout)[0]["average"];
        self.metrics["Master"] = `${self.FormatMs(self.baseNative)} ms`;
    }

    self.CollectBranchCustomRunner = async function(stdout) {
        self.branchNative = JSON.parse(stdout)[0]["average"];
        var change = (self.branchNative - self.baseNative) / self.baseNative;
        self.metrics["Branch"] = `${self.FormatMs(self.branchNative)} ms`;
        self.metrics["Change"] = self.FormatPc(change);
    }

    self.loadStats = async function(path) {
        var buffer = fs.readFileSync(path);
        return JSON.parse(buffer);
    }

    self.Report = async function() {
        var report = "";
        for (metric in self.metrics) {
            report = report + "\n" + `${metric}: ${self.metrics[metric]}`;
        }
        return report;
    }
}

module.exports.Collector = Collector;