---
"@better-auth/mcp": patch
---

`mcp()` no longer throws at startup for a plain-HTTP `resource` on a `.localhost` subdomain such as `http://my-branch.api.localhost/mcp`.
