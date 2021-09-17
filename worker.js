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
