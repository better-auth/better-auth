---
"@better-auth/sso": patch
---

OIDC SSO now works on Cloudflare Workers when discovery is enabled. Redirecting OIDC discovery, token, userinfo, and JWKS endpoints are rejected with a clear configuration error; configure the final endpoint URL instead.
