---
"@better-auth/oauth-provider": minor
---

Return a distinct `expired_request` error when a signed `oauth_query` has a valid signature but its `exp` has passed. Tampered or unsigned queries still return `invalid_signature`.
