---
"@better-auth/oauth-provider": patch
---

Session-end OAuth logout now excludes already-revoked access and refresh tokens when planning which tokens to revoke and which clients to notify.
