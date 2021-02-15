# acala-bench-bot

## Benchmarking bot

## Setup on your local machine

1. `yarn && yarn start`

2. Navigate to: http://localhost:3000

3. Install the Github Bot onto appropriate repository

4. Create a PR

5. Post a comment `/bench <action> <extra>`, for example `/bench runtime pallet module_currencies`

## Configuring

There should be .env file in the root (see .env.example):

```
APP_ID=<git hub app id>
WEBHOOK_SECRET=<github app secret - REQUIRED!>
PRIVATE_KEY_PATH=<path the the private key of the github app or PRIVATE_KEY=(replace new line with '\n')>
WEBHOOK_PROXY_URL=<web hook url (like https://smee.io), not required>
```

Add `BASE_BRANCH=master` or whatever is appropriate.

## Permissions Needed

* Metadata: Read Only
* Issues: Read/Write
* Pull Requests: Read/Write

Make sure to verify the permission increase if you change them.

## Subscriptions Needed

* issue
* issue_comment
