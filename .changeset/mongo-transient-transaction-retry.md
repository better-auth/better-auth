---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/mongo-adapter": patch
---

If you pass `client` to `mongodbAdapter` on a replica set, concurrent requests that write the same documents no longer fail with a 500. Before, MongoDB aborted all but one of them with a write conflict. A SCIM directory that provisions several users at once returned 500 for most of them. The adapter now retries such a transaction, as MongoDB requires, for up to 120 seconds. Under contention a request can therefore take longer instead of failing.

Because a retry runs the work again, `databaseHooks` `before` hooks can run more than once for one request on MongoDB. `after` hooks still run once, after the commit. Keep calls to external services in `after` hooks.

On every adapter, the verification email for an email sign-up or a new social or SSO account, and the `onExistingUserSignUp` callback, now run after the sign-up is saved. A sign-up that rolls back no longer sends an email.
