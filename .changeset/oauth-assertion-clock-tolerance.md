---
"@better-auth/oauth-provider": patch
---

OAuth provider `private_key_jwt` verification now accepts an optional `assertionClockTolerance` (seconds, default 0) so small client/server clock differences on `nbf`/`exp` do not fail MCP token exchange.
