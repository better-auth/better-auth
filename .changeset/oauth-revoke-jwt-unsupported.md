---
"@better-auth/oauth-provider": minor
---

Revoking a JWT access token at `/oauth2/revoke` now returns `400 unsupported_token_type` instead of a misleading `200`. A JWT access token is self-contained and is never stored, so the server cannot revoke it; the previous success response implied otherwise while the token kept working until expiry.

To cut off access for a JWT access token, end the session (sign-out, admin revoke, or back-channel logout), which marks `sid`-bound tokens inactive at introspection and userinfo, or rely on a short token lifetime. Opaque and refresh token revocation are unchanged.
