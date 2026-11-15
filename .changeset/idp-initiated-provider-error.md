---
"better-auth": patch
"@better-auth/sso": patch
---

A provider with `allowIdpInitiated` that redirects to the callback with `error` and no `state` now sends its `error` code to the error URL. `error_description` is logged, not forwarded, and an `error` that isn't a code still reports `state_not_found`. Before, Better Auth reported these as `state_not_found`. Providers without `allowIdpInitiated` still get `state_not_found`.
