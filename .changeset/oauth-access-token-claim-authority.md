---
"@better-auth/oauth-provider": minor
---

Opaque access tokens now return the same claims through `/oauth2/introspect` that a JWT access token would carry for the same grant: any `customAccessTokenClaims` plus per-resource `customClaims`. Reserved claim names the authorization server owns (`iss`, `sub`, `aud`, `scope`, `auth_time`, ...) no longer appear in the introspection response when a `customAccessTokenClaims` callback returns them. An opaque token whose bound resource has since been deleted now introspects as inactive, matching JWT access tokens; disabling a resource still keeps existing tokens valid until they expire. Opaque-token introspection reflects the token's current state; JWT-token introspection reflects the snapshot signed at issuance.

Token introspection is no longer limited to the issuing client. A resource server linked to one of a token's audience resources can now introspect it, the standard split where a frontend client holds the token and a separate API validates it. An authenticated client unrelated to the token still receives `{ active: false }`, and a refresh token can only be introspected by the client that requested it.
