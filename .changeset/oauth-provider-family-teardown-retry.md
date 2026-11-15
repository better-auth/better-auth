---
"@better-auth/oauth-provider": patch
---

Revoking a refresh token, or replaying a rotated one, no longer fails with a server error on MySQL when it races a refresh by the same client and user. The provider now retries the refresh-token family teardown when a delete loses a database deadlock, so the family is revoked instead of staying usable after the grant's revocation mark expires.
