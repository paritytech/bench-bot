# bench-bot

This is a substrate-only bot at the moment.

## How to use

The bot runs commands in response to pull request comments
([example](https://github.com/paritytech/polkadot/pull/2541)). The form is:

`/bench [action] [...args]`

For the response to work, [environment variables](#configuration) and
[Github settings](#github-settings) have to properly configured upfront.

## Configuration

Create an `.env` file in the root with the following:

```
APP_ID=<Github app id>
WEBHOOK_SECRET=<Github app secret>
PRIVATE_KEY_PATH=<Path the the private key of the github app>
BASE_BRANCH=<the default branch for merging into the PRs, e.g. master>
WEBHOOK_PROXY_URL=<optional; webhook proxy for development>
```

For development it's recommended to use [Smee](https://smee.io) for
`WEBHOOK_PROXY_URL`; that way you can test your changes locally without having
to SSH into the dedicated machine - it avoids disrupting the production
service.

## Running

### Locally

`yarn && yarn start`

### Dedicated machine

Note: Before disrupting the production deployment, it's first recommended to
check if some benchmark is running with `pgrep -au benchbot`.

The [run](./run) script is used to manage the application.

`run bootstrap` will take care of creating and installing everything from
scratch. When all is done, a systemd service will be created for you to manage
with `run {start,restart,stop,status}` which acts as a wrapper for `systemctl`.

By default the bot will be bootstrapped to `/home/benchbot/bench-bot` and
executed by the `benchbot` user. From your machine, execute the `run` script
remotely with SSH:

`ssh user@remote '/home/benchbot/bench-bot/run [command]'`

e.g.

`ssh user@remote '/home/benchbot/bench-bot/run restart'`

If developing on a branch, use the `run update [branch]` in order to restart
the bot to your branch of choice. This command will take care of fetching and
restarting the service automatically:

`ssh user@remote '/home/benchbot/bench-bot/run update my-feature-branch'`

The full explanation for all commands is available with `run help`.

After it's running, the logs will be to the systemd journal:

`sudo journalctl -u benchbot.service`

As well as to `./log.txt`.

# Github Settings

## Permissions

* Metadata: Read Only
* Issues: Read/Write
* Pull Requests: Read/Write

## Event subscriptions

* Issue comments
