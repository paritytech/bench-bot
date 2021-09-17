const shell = require("shelljs")

const [cmd] = process.argv.slice(2)

let result = { stdout: "", stderr: "", error: false }

try {
  result = shell.exec(cmd, { silent: false })
  result.error = result.code !== 0
} catch (error) {
  result.error = true
  result.stderr = error.stderr || ""
  result.stdout = error.stdout || ""
}

console.log({ from: "sent", result })
process.send(result)
