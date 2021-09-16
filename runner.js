const cp = require("child_process")
const fs = require("fs")
const path = require("path")
const promisify = require("util").promisify

const writeFileAsync = promisify(fs.writeFile)
const readFileAsync = promisify(fs.readFile)
const unlinkAsync = promisify(fs.unlink)
const execFileAsync = promisify(cp.execFile)

const runnerOutput = path.join(__dirname, "runner_stdout.txt")

class Runner {
  constructor(app) {
    this.app = app
    this.log = app.log
  }

  async run() {
    let stdout = "",
      stderr = "",
      error = true

    try {
      if (title) {
        app.log({ title, msg: `Running task on directory ${process.cwd()}` })
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
        stderr = await readFileAsync(runnerOutput)
      } catch (stderrReadError) {
        app.log.fatal({
          msg: "Failed to read stderr from command",
          error: stderrReadError,
        })
      }
      error = true
      app.log.fatal({
        msg: "Caught exception in command execution",
        error: err,
      })
    }

    return { stdout, stderr, error }
  }
}

module.exports = { Runner }
