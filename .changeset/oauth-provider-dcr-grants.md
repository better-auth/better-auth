---
"@better-auth/oauth-provider": patch
---

Narrow dynamic client registration `grant_types` to the grants the server supports instead of rejecting the whole registration when an unsupported grant accompanies supported ones.
