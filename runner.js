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

const shell = require("shelljs")

class Runner {
  constructor(app) {
    this.log = app.log
  }

  async run(cmd, title) {
    let stdout = "",
      stderr = "",
      error = false

    try {
      if (title) {
        this.log({ title, msg: `Running task on directory ${process.cwd()}` })
      }

      await writeFileAsync(runnerOutput, "")

      // The command is ran asynchronously so that the bot can still handle
      // requests while it's busy running some benchmark. Previously we favored
      // running the command synchronously so that there was less risk of having
      // the Node.js process interfere or deprioritize the process' execution,
      // but that was that was later judged to be unnecessary caution based on
      // the measurements.
      // We've tried to cp.spawn for capturing the processes' streams but,
      // again, such strategy might add execution overhead because then you'd
      // have two processes competing for resources: the benchmark and the app.
      // Running the proces in a shell is useful so that we simply wait until
      // it's done and read the results afterwards, which is less likely to add
      // any sort of friction that could introduce variation in the measurements
      // compared to if one would run them manually.
      const result = shell.exec(cmd, { silent: false })
      stderr = result.stderr
      error = result.code !== 0
      stdout = result.stdout
    } catch (err) {
      error = true
      try {
        if (await existsAsync(runnerOutput)) {
          stderr = (await readFileAsync(runnerOutput)).toString()
        }
      } catch (stderrReadError) {
        this.logFatalError(
          stderrReadError,
          "Failed to read stderr from command",
        )
      }
      this.logFatalError(err, "Caught exception in command execution")
    }

    return { stdout, stderr, error }
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
