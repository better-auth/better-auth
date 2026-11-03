---
"better-auth": patch
"@better-auth/core": patch
---

Generic OAuth providers whose discovery document has a `jwks_uri` now reject a user profile whose `sub` differs from the ID token's `sub`. Direct ID-token sign-in and linking with a generic OAuth provider now resolve the profile from the verified ID token only and ignore a submitted access or refresh token.
