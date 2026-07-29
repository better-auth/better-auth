---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

The MCP plugin defaults that interval to 30 seconds for every client configured through the plugin, allowing a retried refresh to recover the response produced when another request rotated the token. OAuth Provider remains strict by default; set `refreshTokenReuseInterval: 0` on `mcp()` to disable the overlap window.
