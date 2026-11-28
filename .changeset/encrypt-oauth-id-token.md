---
"better-auth": patch
---

`account.encryptOAuthTokens` now encrypts the ID token too. ID tokens stored before this change still read as plain text.
