---
"@better-auth/core": major
"@better-auth/sso": major
"@better-auth/cimd": major
"@better-auth/electron": major
"@better-auth/oauth-provider": major
"better-auth": major
---

Hardened outbound OAuth/OIDC fetches. Better Auth now refuses provider redirects and blocks externally supplied endpoints that resolve to private, link-local, or cloud-metadata addresses.

Add private SSO or Generic OAuth IdPs to `trustedOrigins`. OAuth Provider clients need inline `jwks` or public `jwks_uri` and `backchannel_logout_uri` endpoints.
