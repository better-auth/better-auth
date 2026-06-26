---
"@better-auth/core": major
"@better-auth/sso": major
"@better-auth/cimd": major
"@better-auth/electron": major
"@better-auth/oauth-provider": major
"better-auth": major
---

Hardened outbound OAuth/OIDC fetches. Better Auth now refuses provider redirects and blocks externally supplied endpoints that resolve to private, link-local, or cloud-metadata addresses.

Add private SSO, Generic OAuth, OAuth Provider JWKS, or back-channel logout origins to `trustedOrigins`.
