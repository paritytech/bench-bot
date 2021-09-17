const shell = require("shelljs")

const [command] = process.argv.slice(2)

let stdout = "",
  stderr = "",
  error = false

try {
  const result = shell.exec(cmd, { silent: false })
  stderr = result.stderr
  error = result.code !== 0
  stdout = result.stdout
} catch (error) {
  error = true
  if (!stderr) {
    stderr = error.stderr || ""
  }
}

process.send({ error, stderr, stdout })
