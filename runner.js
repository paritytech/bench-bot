const cp = require("child_process")
const fs = require("fs")
const path = require("path")
const promisify = require("util").promisify

const writeFileAsync = promisify(fs.writeFile)
const readFileAsync = promisify(fs.readFile)
const unlinkAsync = promisify(fs.unlink)
const execFileAsync = promisify(cp.execFile)
const existsAsync = promisify(fs.exists)

const runnerOutput = path.join(__dirname, "runner_output.txt")

class Runner {
  constructor(app) {
    this.log = app.log
  }

  async run(cmd, title) {
    let result = { stdout: "", stderr: "", error: true }

    try {
      if (title) {
        this.log({ title, msg: `Running task on directory ${process.cwd()}` })
      }

      // It was observed that running the command asynchronously, e.g. wrapped
      // in a promise, _directly_ from this program, incurs overhead in the
      // measurements.
      // We do not want to run the command synchronously, either, because even
      // though it does not incur overhead, the bot would stay unresponsive
      // until the command finishes, since it would block the main thread.
      // Our solution is to spawn another program from a worker module which is
      // completely detached from this process and communicates via IPC. Since
      // execution occurs in a different program entirely, it's very unlikely to
      // suffer from overhead, no matter what this application is doing.
      await new Promise(function (resolve) {
        const child = cp.fork(path.join(__dirname, "worker.js"), [cmd], {
          detached: true,
        })
        child.unref()
        child.on("message", function (childResult) {
          result = childResult
        })
        child.on("close", resolve)
      })
    } catch (err) {
      result.error = true
      result.stderr = error.stderr || ""
      result.stdout = error.stdout || ""
      this.logFatalError(err, "Caught exception in command execution")
    }

    return result
  }

  logFatalError(error, context = {}) {
    this.log.fatal({
      error:
        error instanceof Error
          ? { stack: error.stack, text: error.toString() }
          : error,
      ...(typeof context === "string"
        ? { msg: context }
        : { msg: "logFatalError", ...context }),
    })
  }
}

module.exports = { Runner }
