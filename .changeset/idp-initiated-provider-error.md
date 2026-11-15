---
"better-auth": patch
"@better-auth/sso": patch
---

A provider with `allowIdpInitiated` that redirects to the callback with `error` and no `state` now sends its `error` and `error_description` to the error URL. Before, Better Auth reported these as `state_not_found`. Providers without `allowIdpInitiated` still get `state_not_found`.
