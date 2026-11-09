---
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
---

Fixed back-channel logout, `jwks_uri` client authentication, and Client ID Metadata Document fetches failing on Cloudflare Workers, which rejects `redirect: "error"`. Redirects from these endpoints are still refused.
