---
"@better-auth/oauth-provider": patch
---

A password reset that revokes sessions (`emailAndPassword.revokeSessionsOnPasswordReset`) and `/revoke-sessions` now revoke all of the user's OAuth access and refresh tokens, including `offline_access` refresh tokens. A normal sign-out still keeps `offline_access` refresh tokens.
