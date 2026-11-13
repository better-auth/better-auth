---
"@better-auth/mcp": patch
---

`requireMcpAuth` now accepts tokens when the JWT plugin publishes its keys at `jwks.remoteUrl`. It fetches the keys from that URL instead of the auth server's own `/jwks` endpoint, which the JWT plugin disables in that setup.
