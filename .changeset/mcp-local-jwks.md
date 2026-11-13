---
"@better-auth/mcp": patch
"@better-auth/core": patch
---

`requireMcpAuth` now reads the signing keys from the auth instance instead of requesting its own `/jwks` endpoint, so MCP routes served from the same app as the auth server no longer fail with a 500 on runtimes that block requests to their own hostname, such as a single Cloudflare Worker.

Set `jwksUrl` to keep fetching the keys over HTTP.
