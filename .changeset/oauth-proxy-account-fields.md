---
"better-auth": patch
---

Run `getAccountFields` when a sign-in or account link goes through `oAuthProxy`. Before, the proxied flow skipped it, so its fields were not stored on the account and its rejections did not stop the sign-in.
