---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
"better-auth": minor
---

OAuth provider now models protected resources explicitly. Configure them with `resources` or create them through the `oauthResource` admin API. Each resource can define token TTLs, allowed scopes, custom JWT claims, and JWT signing pins.

`validAudiences` is removed. Move each existing resource identifier into `resources`; link clients that should be limited to specific resources through `oauthClientResource` or Dynamic Client Registration `resources`.

Access-token issuance now applies resource policy to the requested RFC 8707 `resource` values. The OAuth provider narrows scopes to resource allowlists, uses the shortest configured TTL, strips reserved RFC 9068 claim names from custom claims, emits `jti`, and keeps repeated `resource` form parameters.

Refresh-token TTLs now use the shortest applicable lifetime. Deployments with a per-resource `refreshTokenTtl` longer than `refreshTokenExpiresIn` will see refresh tokens expire at the provider default instead of the longer resource value.

JWT signing can now honor per-resource pins. `signJWT()` accepts `signingKeyId` and `signingAlgorithm`; JWKS adapters expose `getKeyById()` and `getLatestKeyByAlg()`. The `jwks` table adds nullable `alg` and `crv` columns, and `keyPairConfigs` can provision multiple algorithms in one keyring.

After upgrading, run `npx @better-auth/cli generate` and apply the migration before deploying. The migration adds `oauthResource`, `oauthClientResource`, and the new `jwks` columns. Without it, resources using `signingAlgorithm` cannot find matching keys.

Resource servers should publish RFC 9728 protected-resource metadata at their own origin. The OAuth provider exposes challenge helpers that point clients at that metadata.

`@better-auth/mcp` now requires an explicit `resource` option. The plugin stores that identifier as an OAuth resource, publishes RFC 9728 protected-resource metadata for it, and binds issued access tokens to that resource. Existing `mcp({ loginPage, consentPage })` setups should add a protected MCP resource identifier, for example `resource: "https://api.example.com/mcp"`.
