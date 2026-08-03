---
"@better-auth/oauth-provider": patch
---

`customUserInfoClaims`, `customIdTokenClaims` and `customAccessTokenClaims` report the auth instance's user type, so configured `additionalFields` arrive with their declared types instead of `unknown`.
