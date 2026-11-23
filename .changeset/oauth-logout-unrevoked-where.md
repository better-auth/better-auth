---
"@better-auth/oauth-provider": patch
---

Session-end OAuth logout now loads only unrevoked access and refresh tokens for the session, so already-revoked rows are not listed for revocation or back-channel delivery.
