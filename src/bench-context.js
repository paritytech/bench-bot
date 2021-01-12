
const shell = require('shelljs');

function escq (cmd) {
  const escaped = String.prototype.replace.call(cmd, /'/gm, "'\\''");
  return `'${escaped}'`;
}

function BenchContext(app, config) {
    let self = this;
    self.app = app;
    self.config = config;

    self.temp_dir = process.env.BENCH_TEMP_DIR || 'git';

    self.createTempDir = function (){
        let cmd = `mkdir -p ${self.temp_dir}`
        self.runTask(cmd, `Creating temp working dir ${self.temp_dir}`, false);
    }

    self.runTask = function(cmd, title, in_temp_dir=true) {
        if (title) app.log(title);

        let cmds = in_temp_dir ? `cd ${self.temp_dir} && ${cmd}` : `${cmd}`;

        let cmdString = self.remoteWrapper(cmds);

        const { stdout, stderr, code } = shell.exec(cmdString, { silent: true });
        let error = false;

        if (code !== 0) {
            app.log(`ops.. Something went wrong (error code ${code})`);
            app.log(`stderr: ${stderr}`);
            error = true;
        }

        return { stdout, stderr, error };
    }

    self.remoteWrapper = function(cmd){
        if (self.config.remote !== undefined) {
            let { host, user} = config.remote;

            let domain = `${user}@${host}`;
            return `ssh ${domain} ${escq(cmd)}`;
        }
        return cmd;
    }
}

module.exports = {
    BenchContext: BenchContext
}