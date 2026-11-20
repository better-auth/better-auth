---
"@better-auth/oauth-provider": patch
---

The end-session endpoint now accepts an ID token the provider issued as `id_token_hint` when `baseURL` has a path and ends with a slash, or when `jwt.issuer` ends with a slash. These ID tokens carry the issuer as configured, while the hint check compared it with the published issuer, which drops the trailing slash, so logout answered `invalid_token` or asked for confirmation. The issuer in discovery and in issued tokens is unchanged.
