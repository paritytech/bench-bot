const cp = require("child_process")
const fs = require("fs")
const path = require("path")
const promisify = require("util").promisify

const writeFileAsync = promisify(fs.writeFile)
const readFileAsync = promisify(fs.readFile)
const unlinkAsync = promisify(fs.unlink)
const execFileAsync = promisify(cp.execFile)
const existsSync = promisify(fs.existsSync)

const runnerOutput = path.join(__dirname, "runner_stdout.txt")

class Runner {
  constructor(app) {
    this.log = app.log
  }

  async run(cmd, title) {
    let stdout = "",
      stderr = "",
      error = true

    try {
      if (title) {
        this.log({ title, msg: `Running task on directory ${process.cwd()}` })
      }

      await writeFileAsync(runnerOutput, "")

      // We the command is ran asynchronously so that the bot can still handle
      // requests while it's executing. Previously we favored running the
      // command synchronously so that there was less risk of having the Node.js
      // process interfere or deprioritize the process' execution, but that it
      // was observed that was unnecessary caution.
      // Previously we've used cp.spawn for capturing the processes' streams
      // but, again, having it execute directly in the shell reduces the
      // likelihood of friction or overhead due to Node.js APIs.
      // Since we should be redirecting the program's output streams to the
      // systemd journal in the deployment, it's also relevant that we do not
      // capture the process' streams here.
      await execFileAsync(
        "bash",
        ["-c", `(${cmd}) 2>&1 | tee ${runnerOutput}`],
        { stdio: "ignore" },
      )

      stdout = await readFileAsync(runnerOutput)
      await unlinkAsync(runnerOutput)
    } catch (err) {
      try {
        if (await existsSync(runnerOutput)) {
          stderr = await readFileAsync(runnerOutput)
        }
      } catch (stderrReadError) {
        this.logFatalError(
          stderrReadError,
          "Failed to read stderr from command",
        )
      }
      error = true
      this.logFatalError(err, "Caught exception in command execution")
    }

    return { stdout, stderr, error }
  }

  logFatalError(error, context = {}) {
    this.log.fatal({
      error: error instanceof Error ? error.stack : error,
      ...(typeof context === "string"
        ? { msg: context }
        : { msg: "logFatalError", ...context }),
    })
  }
}

module.exports = { Runner }
