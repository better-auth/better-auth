---
"@better-auth/oauth-provider": patch
---

OAuth Provider claim contributors registered through `extendOAuthProvider` now receive the issuing session id. A `claims.idToken` or `claims.accessToken` contributor reads it from `input.sessionId` to derive per-session claims on the `authorization_code` and `refresh_token` grants. It is undefined where there is no session, such as `client_credentials`, opaque-token introspection, or a session that was deleted.
