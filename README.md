# bench-bot

## Benchmarking bot

This is a substrate-only bot at the moment.

## How To

1. `yarn && yarn start`

2. Navigate to: http://localhost:3000

3. Install the Github Bot onto appropriate repository

4. Create a PR

5. Post a comment `/bench <action>`, for example `/bench import`

## Configuring

There should be .env file in the root:

```
APP_ID=<git hub app id>
WEBHOOK_SECRET=<github app secret - REQUIRED!>
PRIVATE_KEY_PATH=<path the the private key of the github app>
WEBHOOK_PROXY_URL=<web hook url (like https://smee.io), not required>
```

Add `BASE_BRANCH=master` or whatever is appropriate.

#### Allowed users

It is possible to restrict who can execute a benchmark. 

Add `ALLOWED_USERS` with comma separated list of user's github ids. Eg: 

`ALLOWED_USERS=123,455,234`

Github user id can be retrieved using Github API: https://api.github.com/users/your_github_user_name

If `ALLOWD_USERS` is not specified - any user can execute the benchmark.

## Permissions Needed

* Metadata: Read Only
* Issues: Read/Write
* Pull Requests: Read/Write

Make sure to verify the permission increase if you change them.

## Subscriptions Needed

* issue
* issue_comment
