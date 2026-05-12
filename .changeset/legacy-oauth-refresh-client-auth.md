---
"better-auth": patch
---

fix(oidc-provider, mcp): authenticate confidential clients on refresh_token grant and harden secret comparison

Refresh-token grants on the legacy `oidc-provider` and `mcp` plugins now require the registered `client_secret` from confidential clients, matching the `authorization_code` path. Public clients (where `code_verifier` substitutes for the secret on the auth-code grant) continue to skip secret validation. Secret comparisons across both plugins now use constant-time equality. The `/mcp/token` endpoint no longer emits a wildcard CORS `Access-Control-Allow-Origin: *` header.

These plugins are deprecated in favor of `@better-auth/oauth-provider`, which is unaffected. New deployments should adopt the replacement; this patch keeps existing deployments protected while migrating.
