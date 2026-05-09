---
"better-auth": major
"@better-auth/core": major
---

Email change confirmation and verification tokens are now single-use. Replaying the same verification link is rejected with TOKEN_ALREADY_USED instead of silently succeeding and re-sending emails.
