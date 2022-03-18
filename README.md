# bench-bot

This is a substrate-only bot at the moment.

# How to use

The bot runs commands in response to pull request comments
([example](https://github.com/paritytech/polkadot/pull/2541)). The form is:

`/bench [action] [...args]`

[Environment variables](#configuration) and
[Github settings](#required-github-settings) have to properly configured
upfront for this interaction to work.

# Configuration

Create a `.env` file in the root with the following:

```
APP_ID=<App id from Github App Settings>
BASE_BRANCH=<the default branch for merging into the PRs, e.g. master>
CLIENT_ID=<Client ID from Github App Settings>
CLIENT_SECRET=<Client ID from Github App Settings>
PRIVATE_KEY_PATH=<Path the the private key of the github app>
WEBHOOK_SECRET=<Webhook secret from Github App Settings>
WEBHOOK_PROXY_URL=<optional; webhook proxy for development>
```

During development it's recommended to use [smee](https://smee.io) for
`WEBHOOK_PROXY_URL` because it enables testing your bot's functionality
locally, without having to SSH into the dedicated machine.

# Linting and formatting

The commands `yarn run format` and `yarn run lint` are available for ensuring
style consistency on this project's code.

# Running

## Locally

`yarn && yarn start`

## Dedicated machine

_Note: Before disrupting the production deployment, it's first recommended to
check if some benchmark is running through_ `pgrep -a cargo` _._

The [run script](./run) is used to manage the application. Use `run help` for
documentation about its options.

`run bootstrap` will take care of creating and installing everything from
scratch. After install, you'll also need to set up
[environment variables](#configuration) which optionally can be done through
a `.env` file in the bot's installation path.

### Bot commands

- `run {start,stop,restart}`: execute the relevant action for the bot.
- `run update [ref]`: restart the bot with the branch or PR
  - For branch: `ssh user@remote '/home/benchbot/bench-bot/run update master'`
  - For PR: `ssh user@remote '/home/benchbot/bench-bot/run update pull/number/head:branch'`
    e.g. `pull/1/head:master`

### Logs

See <https://gitlab.parity.io/groups/parity/opstooling/-/wikis>

# Required Github settings

## Permissions

* Metadata: Read Only
* Issues: Read/Write
* Pull Requests: Read/Write
* Contents: Read/Write

## Event subscriptions

* Issue comments
