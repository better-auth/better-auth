---
"better-auth": patch
---

`account.encryptOAuthTokens` now covers the ID token as well. Previously only
the access token and refresh token were encrypted, so the ID token was still
written to the account table in plain text. ID tokens stored before this change
are still readable, and get encrypted the next time the account is written.
