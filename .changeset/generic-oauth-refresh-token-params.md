---
"better-auth": minor
"@better-auth/core": minor
---

feat(generic-oauth): add `refreshTokenParams` config to forward extra params on token refresh

Multi-tenant OIDC providers (Zitadel multi-org, Auth0 with `audience`, AWS Cognito) need to send extra body params on the refresh call to rescope tokens without a full authorization redirect. The generic-oauth plugin now accepts a `refreshTokenParams` option (object or sync/async function) that is merged into the refresh request body, with `grant_type` and `refresh_token` protected from override. The function form receives the `GenericEndpointContext` of the request that triggered the refresh, so request-scoped data (headers, cookies) is available without out-of-band state like AsyncLocalStorage.

`UpstreamProvider.refreshAccessToken` now accepts an optional second `ctx` argument; the change is backwards compatible because existing implementations that take only `refreshToken` remain valid. See [#7554](https://github.com/better-auth/better-auth/issues/7554).
