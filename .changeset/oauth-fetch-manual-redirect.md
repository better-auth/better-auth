---
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
---

Fixed back-channel logout, `jwks_uri` client authentication, and Client ID Metadata Document fetches failing on Cloudflare Workers, which rejects `redirect: "error"`. Redirects from these endpoints are still refused. With a fetch-based transport, a redirecting metadata URL now reports `Metadata document fetch returned HTTP 30x` instead of `Failed to fetch metadata document (network error or redirect blocked)`; the error code and status are unchanged.
