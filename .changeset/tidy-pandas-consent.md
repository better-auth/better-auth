---
"@better-auth/oauth-provider": patch
---

Fixed `auth.api.oauth2Consent()` failing with "request not found" when called programmatically without a raw `Request`. The authorize endpoint now falls back to `ctx.headers` when `ctx.request` is absent, so server-side custom consent pages can complete the flow with just headers and `oauth_query`.
