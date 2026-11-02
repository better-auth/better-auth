---
"@better-auth/oauth-provider": patch
---

Concurrent refresh-token grants inside the reuse interval now receive the same rotated response instead of `invalid_grant`.
