---
"better-auth": patch
"@better-auth/core": patch
---

Email change confirmation and verification tokens are now single-use. Replaying the same verification link is rejected with TOKEN_ALREADY_USED instead of silently succeeding and re-sending emails.
