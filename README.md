# bench-bot

## Benchmarking bot

This is a substrate-only bot at the moment.

## Configuring

There should be .env file in the root:

```
APP_ID=<git hub app id>
WEBHOOK_SECRET=<github app secret - REQUIRED!>
PRIVATE_KEY_PATH=<path the the private key of the github app>
WEBHOOK_PROXY_URL=<web hook url (like https://smee.io), not required>
```
