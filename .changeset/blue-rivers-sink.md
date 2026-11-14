---
"@better-auth/core": patch
---

Kakao sign-in now uses PKCE, sending `code_challenge` in the authorization request and `code_verifier` in the token request.
