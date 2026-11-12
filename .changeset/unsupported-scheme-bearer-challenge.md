---
"@better-auth/oauth-provider": patch
---

A protected resource request that uses an unsupported authorization scheme, such as `Basic`, or sends a token with no scheme, now gets a `Bearer` challenge with its `resource_metadata` pointer instead of a `DPoP` challenge. MCP clients can find the authorization server again from that response.
