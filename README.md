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
APP_ID=<App id from Github App Settings>
BASE_BRANCH=<the default branch for merging into the PRs, e.g. master>
CLIENT_ID=<Client ID from Github App Settings>
CLIENT_SECRET=<Client ID from Github App Settings>
PRIVATE_KEY_PATH=<Path the the private key of the github app>
WEBHOOK_SECRET=<Webhook secret from Github App Settings>
WEBHOOK_PROXY_URL=<optional; webhook proxy for development>
```

For development it's recommended to use [smee](https://smee.io) for
`WEBHOOK_PROXY_URL`; that way you can test your changes locally without having
to SSH into the dedicated machine - it avoids disrupting the production
service.

## Running

### Locally

`yarn && yarn start`

### Dedicated machine

Note: Before disrupting the production deployment, it's first recommended to
check if some benchmark is running with `pgrep -au benchbot`. With SSH:

`ssh user@remote 'sudo pgrep -au benchbot'`

And check if the command above shows any `cargo` or `rust` command being ran
currently (for the Rust benchmarks).

#### Introduction

The [run](./run) script is used to manage the application.

`run bootstrap` will take care of creating and installing everything from
scratch. After installation, a systemd service will be created for you to
manage with `run {start,restart,stop,status}` which acts as a wrapper for
`systemctl`.

#### Updating branches

The `update` subcommand will fetch and restart the bot with the selected branch. e.g.

`ssh user@remote '/home/benchbot/bench-bot/run update master'`

For pull requests, the format is `pull/${ID}/head:${BRANCH}` as per the
[Github specification](https://docs.github.com/en/github/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/checking-out-pull-requests-locally#modifying-an-inactive-pull-request-locally). e.g.

`ssh user@remote '/home/benchbot/bench-bot/run update pull/1/head:branch'`

#### Setting up

By default the bot will be bootstrapped to `/home/benchbot/bench-bot` and
executed by the `benchbot` user. From your machine, execute the `run` script
remotely with SSH:

`ssh user@remote '/home/benchbot/bench-bot/run [command]'`

e.g.

`ssh user@remote '/home/benchbot/bench-bot/run restart'`


#### Additional information

The full explanation for all commands is available with `run help`.

After it's running, the logs will be to the systemd journal:

`sudo journalctl -u benchbot.service`

As well as to `./log.txt`.

# Github Settings

## Permissions

* Metadata: Read Only
* Issues: Read/Write
* Pull Requests: Read/Write
* Contents: Read/Write

## Event subscriptions

* Issue comments
