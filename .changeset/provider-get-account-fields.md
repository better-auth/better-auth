---
"better-auth": patch
"@better-auth/core": patch
---

Social providers accept a `getAccountFields` option that stores your own values on the provider account. Return values for the fields you declare in `account.additionalFields`, and Better Auth saves them when the account is created, linked, or updated at sign-in. The option does nothing when you leave it unset, and it cannot replace the provider ID, account ID, or tokens.
