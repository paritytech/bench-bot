// This module will be spawned as a separate process and communicate with the
// main process through IPC (note the process.send at the end). Such measure is
// necessary to avoid overhead while still keeping the main process responsive.

const shell = require("shelljs")

const [cmd] = process.argv.slice(2)

const result = { stdout: "", stderr: "", error: true }

try {
  const cmdResult = shell.exec(cmd, { silent: false })
  result.stdout = cmdResult.stdout
  result.stderr = cmdResult.stderr
  result.error = cmdResult.code !== 0
} catch (error) {
  result.error = true
  result.stderr = error.stderr || ""
  result.stdout = error.stdout || ""
}

process.send(result)
