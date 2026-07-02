---
"@better-auth/core": minor
"@better-auth/sso": minor
"@better-auth/cimd": minor
"@better-auth/electron": minor
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Server-side OAuth/OIDC fetches now refuse redirects and block private, link-local, or cloud-metadata endpoints unless their origin is listed in `trustedOrigins`.

Add private SSO, Generic OAuth, CIMD, OAuth Provider JWKS, or back-channel logout origins to `trustedOrigins`.
