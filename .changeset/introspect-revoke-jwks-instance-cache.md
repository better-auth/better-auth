---
"@better-auth/oauth-provider": patch
---

Token introspection and revocation no longer fetch the signing keys from the database on every request. Keys are cached per auth instance with the same five-minute refresh as remote JWKS sources.
