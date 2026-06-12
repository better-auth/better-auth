---
"@better-auth/oauth-provider": minor
---

Revoking a JWT access token that still verifies for this server now returns `400 unsupported_token_type` at `/oauth2/revoke` instead of a misleading `200`. A JWT is self-contained and is never stored, so the server cannot revoke it; the previous success response implied otherwise while the token kept working until expiry. An already-expired or wrong-audience JWT fails verification and still returns a successful `200` no-op.

To cut off access for a JWT access token, end the session (sign-out, admin revoke, or back-channel logout), which marks `sid`-bound tokens inactive at introspection and userinfo, or rely on a short token lifetime. Opaque and refresh token revocation are unchanged.
