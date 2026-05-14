---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

Expired magic-link tokens and OAuth authorization codes are now reliably rejected. Magic-link verify redirects to `?error=INVALID_TOKEN` for expired tokens (was `?error=EXPIRED_TOKEN`). The OIDC, MCP, and `@better-auth/oauth-provider` `/token` endpoints return `error_description: "invalid code"` for expired codes (was `"code expired"`). The OAuth `error` value stays `invalid_grant`.
