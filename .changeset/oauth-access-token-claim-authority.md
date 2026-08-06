---
"@better-auth/oauth-provider": minor
---

`/oauth2/introspect` now returns the same claims for opaque and JWT access tokens, and lets a resource server introspect a token meant for it.

Introspecting an opaque token now returns the claims a JWT would carry for the same grant: your `customAccessTokenClaims` and any per-resource `customClaims`. Opaque tokens used to return a smaller set. The server owns the reserved claim names (`iss`, `sub`, `aud`, `scope`, `auth_time`, and similar); if a `customAccessTokenClaims` callback returns one, it is now dropped instead of overwriting the server's value.

An opaque token's claims are recomputed on every introspection, so the response shows current state. Deleting its resource now makes it report `{ active: false }`, the same as a JWT. Disabling a resource keeps existing tokens valid until they expire. A JWT, by contrast, always reflects what was signed when it was issued.

A resource server can now introspect a token issued to a different client. This is the usual setup: a frontend holds the token and a separate API validates it. The API must be registered as a resource and linked to the client. Any other authenticated client still gets `{ active: false }`, and a refresh token can only be introspected by the client that requested it.
