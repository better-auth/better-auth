---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

The MCP plugin defaults that interval to 30 seconds for native/public clients that can retry a refresh with the old token after another local session already rotated it. Set `refreshTokenReuseInterval: 0` to keep strict replay handling.
