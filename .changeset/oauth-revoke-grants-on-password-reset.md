---
"@better-auth/oauth-provider": patch
---

A password reset that revokes sessions (`emailAndPassword.revokeSessionsOnPasswordReset`) and `/revoke-sessions` now revoke the user's stored opaque access tokens and refresh tokens, including `offline_access` refresh tokens, when at least one live session is deleted. In-flight refresh rotations cannot leave active replacement tokens behind, and each request sweeps a user's tokens once while retaining per-session logout delivery. A password reset for a user with no live session does not revoke these grants. Self-contained JWT access tokens are not directly revoked and can remain valid until expiry; introspection and userinfo still enforce session liveness for session-bound tokens. A normal sign-out keeps `offline_access` refresh tokens.
