# @better-auth/mcp

## 1.7.3

### Patch Changes

- Updated dependencies [[`4d09d50`](https://github.com/better-auth/better-auth/commit/4d09d502254f1bfe65dafc8d813d803225429c4a)]:
  - @better-auth/oauth-provider@1.7.3

## 1.7.2

### Patch Changes

- Updated dependencies [[`bb8d7c4`](https://github.com/better-auth/better-auth/commit/bb8d7c4541992baedd53325761e19a919a805fc7), [`fced1a5`](https://github.com/better-auth/better-auth/commit/fced1a5d360c14e6358f88dedc9014ff862873f1)]:
  - @better-auth/oauth-provider@1.7.2

## 1.7.1

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.1

## 1.7.0

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - MCP clients that hit a scope wall now learn exactly which scopes to ask for. Missing protected scopes produce a `403` with an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge that names every missing scope. Clients can union those scopes into one authorization request instead of opening one browser redirect per scope.
  - Configure protected scopes with `requiredScopes` through `RequireMcpAuthOptions` or the matching `createMcpProtectedRequestHandler` verifier option. Exact membership remains the default; `isScopeSatisfied` can define hierarchical policies.
  - Use `createInsufficientScopeError` when an operation determines its required scopes dynamically. `createResourceServerChallenge` converts that signal and recognized token failures into safe RFC 6750 challenges.
  - Use `challengeScopes` only as the unauthenticated challenge hint.

  Handler-produced responses, ordinary permission denials, configuration failures, and unrelated thrown values keep their original status and identity.

- [#9992](https://github.com/better-auth/better-auth/pull/9992) [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The MCP plugin moves out of `better-auth` into its own package, `@better-auth/mcp`, built on `@better-auth/oauth-provider`. Import the authorization plugin and protected-request helpers from the package root. The in-core MCP client (`createMcpAuthClient` and its adapters) is removed; MCP protocol and transport clients come from the official version 2 `@modelcontextprotocol/client` and `@modelcontextprotocol/server` packages. The OAuth endpoints move from `/mcp/*` to `/oauth2/*`, with discovery at `/.well-known/oauth-authorization-server` and protected resource metadata at `/.well-known/oauth-protected-resource`. Discovery-based MCP clients pick up the new locations on their own.

  The shared-auth route helper is renamed from `withMcpAuth` to `requireMcpAuth`. The standalone protected-resource factory is renamed from `mcpHandler` to `createMcpProtectedRequestHandler`; pass one flat `McpProtectedRequestHandlerOptions` object with `issuer`, a single `audience`, optional `jwtVerifyOptions`, token-verification fields, and challenge fields. Its callback receives `accessTokenClaims`. `requireMcpAuth` verifies the access token against the published JWKS, validates DPoP proofs for DPoP-bound tokens, and passes the verified access-token claims to your handler.

  `createInsufficientScopeError` now validates a custom description against the RFC 6750 `error_description` character set when the error is constructed. Invalid descriptions throw `TypeError("invalid error_description")` before an error can reach resource-challenge serialization.

  MCP 2026-07-28 uses a stateless request and response transport. Serve MCP routes with version 2 of `@modelcontextprotocol/server`, configure `createMcpHandler` with `legacy: "reject"`, wrap it with `requireMcpAuth`, and export only `POST`. Remove MCP-route `GET` and `DELETE` exports and session-store options such as `redisUrl`. OAuth clients, consent, authorization codes, refresh tokens, and security records remain durable authorization state.

  To migrate, install `@better-auth/mcp`, `@better-auth/cimd`, and the official version 2 MCP client or server package needed by your application; add the `jwt()` plugin, which is now required for token signing; and move options that were nested under `oidcConfig` to flat options on `mcp({ ... })`. The database models change: `oauthApplication` becomes `oauthClient`, with new `oauthRefreshToken` and `oauthClientAssertion` tables. Regenerate or migrate your schema with `npx auth migrate` or `npx auth generate`.

- [#10039](https://github.com/better-auth/better-auth/pull/10039) [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider)!: DPoP-bound access tokens (RFC 9449)

  OAuth provider integrations can issue and verify DPoP sender-constrained tokens. Clients request them with `dpop_bound_access_tokens` at registration, `dpop_jkt` on the authorization request, or by targeting a resource configured with `dpopBoundAccessTokensRequired`. Issued tokens carry `cnf.jkt`, return `token_type: "DPoP"`, and stay bound through refresh-token rotation, introspection, and userinfo.

  Resource servers verify DPoP requests with `verifyAccessTokenRequest`, which checks the `Authorization: DPoP` scheme, the proof, the request target, the access-token hash, and proof replay. The MCP package advertises DPoP in protected resource metadata and verifies DPoP-bound requests. Proof replay is rejected through the database-backed verification store, so anti-replay holds across instances. `verifyAccessTokenRequest` and `requireMcpAuth` use that store by default; build one with `createDpopReplayStore(internalAdapter)` or pass a custom `dpop.replayStore`. This needs database-backed verification storage: a secondary-storage-only deployment rejects DPoP requests rather than skipping replay protection.

  Breaking: the raw-token verifier `verifyAccessToken` is renamed to `verifyBearerToken`, both in `better-auth/oauth2` and as the `oauthProviderResourceClient` action, and it rejects DPoP-bound tokens. Use `verifyAccessTokenRequest` on any endpoint that may receive them. The resource-request input type is renamed from `AccessTokenRequestInput` to `ResourceRequestInput`, and the DPoP algorithm option is `signingAlgorithms` everywhere.

  Run a schema migration for the DPoP token-binding fields: the `confirmation` column on the access-token and refresh-token tables. DPoP-bound clients also gain `dpopBoundAccessTokens` and resources `dpopBoundAccessTokensRequired`. No dedicated replay table is added; proof replay reuses the verification store.

- [#9648](https://github.com/better-auth/better-auth/pull/9648) [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627) Thanks [@brentmitchell25](https://github.com/brentmitchell25)! - OAuth provider now models protected resources explicitly. Configure them with `resources` or create them through the `oauthResource` admin API. Each resource can define token TTLs, allowed scopes, custom JWT claims, and JWT signing pins.

  `validAudiences` is removed. Move each existing resource identifier into `resources`; link clients that should be limited to specific resources through `oauthClientResource` or Dynamic Client Registration `resources`.

  Access-token issuance now applies resource policy to the requested RFC 8707 `resource` values. The OAuth provider narrows scopes to resource allowlists, uses the shortest configured TTL, strips reserved RFC 9068 claim names from custom claims, emits `jti`, and keeps repeated `resource` form parameters.

  Refresh-token TTLs now use the shortest applicable lifetime. Deployments with a per-resource `refreshTokenTtl` longer than `refreshTokenExpiresIn` will see refresh tokens expire at the provider default instead of the longer resource value.

  JWT signing can now honor per-resource pins. `signJWT()` accepts `signingKeyId` and `signingAlgorithm`; JWKS adapters expose `getKeyById()` and `getLatestKeyByAlg()`. The `jwks` table adds nullable `alg` and `crv` columns, and `keyPairConfigs` can provision multiple algorithms in one keyring.

  After upgrading, run `npx auth generate` and apply the migration before deploying. The migration adds `oauthResource`, `oauthClientResource`, and the new `jwks` columns. Without it, resources using `signingAlgorithm` cannot find matching keys.

  Resource servers should publish RFC 9728 protected-resource metadata at their own origin. The OAuth provider exposes challenge helpers that point clients at that metadata.

  `@better-auth/mcp` now requires an explicit `resource` option. The plugin stores that identifier as an OAuth resource, publishes RFC 9728 protected-resource metadata for it, and binds issued access tokens to that resource. Existing `mcp({ loginPage, consentPage })` setups should add a protected MCP resource identifier, for example `resource: "https://api.example.com/mcp"`.

- [#10145](https://github.com/better-auth/better-auth/pull/10145) [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

  The MCP plugin defaults that interval to 30 seconds for every configured client. A retried refresh can recover the response produced when another request rotated the token. OAuth Provider remains strict by default; set `refreshTokenReuseInterval: 0` on `mcp()` to disable the overlap window.

### Patch Changes

- [#9131](https://github.com/better-auth/better-auth/pull/9131) [`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Dynamic `baseURL` configurations now resolve consistently for direct server API calls and OAuth or MCP discovery:
  - Fail with a clear `APIError` when no base URL can be resolved or the request host violates `allowedHosts`.
  - Apply `advanced.trustedProxyHeaders` before trusting forwarded host and protocol values, and refresh request-dependent trusted origins, trusted providers, and cookies for each direct call.
  - Infer HTTP for loopback development hosts when only headers are available, while rejecting request-like objects without usable URL and header data.
  - Generate OAuth issuer, discovery, protected-resource, and JWKS URLs from the current request host.
  - Make `requireMcpAuth` use the resolved Better Auth URL for its default issuer, resource, and JWKS URL. Resource servers with fully dynamic hosts can use `createMcpProtectedRequestHandler` with explicit verification options.
  - Preserve metadata response headers supplied as `Headers`, tuple arrays, or records.

- Updated dependencies [[`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5), [`132e293`](https://github.com/better-auth/better-auth/commit/132e293d7a82db30d7d1a63fb32c28df863204ae), [`267229b`](https://github.com/better-auth/better-auth/commit/267229bd24d5f918ac4c9c7eca7507e8c603e310), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`cd8313b`](https://github.com/better-auth/better-auth/commit/cd8313ba003a8b3c46b11fefeae9a53305908cc3), [`4fe730a`](https://github.com/better-auth/better-auth/commit/4fe730a9c12f2ff68ca84523817b550adc7b2982), [`6782647`](https://github.com/better-auth/better-auth/commit/6782647d7c2d248246f9ef3980e656725c29ce64), [`e3125e8`](https://github.com/better-auth/better-auth/commit/e3125e872d40cdd6588cbcb65d8ca0d640bae15b), [`508d8d6`](https://github.com/better-auth/better-auth/commit/508d8d6f06488d33a44d11059c873fcb8721d7a1), [`a8200b2`](https://github.com/better-auth/better-auth/commit/a8200b297c4092cb51397a9285ef4d1f024dea75), [`5c6de4e`](https://github.com/better-auth/better-auth/commit/5c6de4ed265e7aa30e7e42a0e493386cf3ad6c96), [`b4b0867`](https://github.com/better-auth/better-auth/commit/b4b086722c2da179f885ad2680e10ed3410ad849), [`c7d2253`](https://github.com/better-auth/better-auth/commit/c7d22539ec4f7322d9625ae2953d397c3863d097), [`335cda7`](https://github.com/better-auth/better-auth/commit/335cda702ef8e2aecad4b26a427f16953e3aabd2), [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222), [`2fd3d58`](https://github.com/better-auth/better-auth/commit/2fd3d5850006d164317d4f53a81ac95f2d1f549a), [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9), [`6f2948e`](https://github.com/better-auth/better-auth/commit/6f2948e87bb5fa14bd2174a91f7143e1eced1b87), [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f), [`7d1288e`](https://github.com/better-auth/better-auth/commit/7d1288e7c56a2385713cbcc232a376a7fe228be4), [`f68044d`](https://github.com/better-auth/better-auth/commit/f68044dcfbd9fb83763249ed9509cfacbcce47be), [`050ef2d`](https://github.com/better-auth/better-auth/commit/050ef2dfcf22429135b49804de195f945f59f3c1), [`0e1770a`](https://github.com/better-auth/better-auth/commit/0e1770ac7563a27b1daab96d5d571657b3a45f75), [`a796214`](https://github.com/better-auth/better-auth/commit/a7962147b3a759ce6da542300e31f3b5705a63fa), [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627), [`3e852a2`](https://github.com/better-auth/better-auth/commit/3e852a26500446b2c4ad608933c71b616ceddba5), [`d368217`](https://github.com/better-auth/better-auth/commit/d368217efc1265996460d96c539b2ca669e33d49), [`dd42701`](https://github.com/better-auth/better-auth/commit/dd42701af4b8aa56287c6890a8217a270249571f), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`801968e`](https://github.com/better-auth/better-auth/commit/801968e354067869318718f4766d7011c0218a86), [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656), [`0143d69`](https://github.com/better-auth/better-auth/commit/0143d69195870ea6550a40add8618361dbbc3b8f), [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51), [`6f9a188`](https://github.com/better-auth/better-auth/commit/6f9a188bbb2665e56be1f1fb566eb1f5f919e1c8), [`f451d1c`](https://github.com/better-auth/better-auth/commit/f451d1c7589ddb4d2995fa54aee9375472ebea33), [`69acb7a`](https://github.com/better-auth/better-auth/commit/69acb7a3db3cd148a9cd1db5063dbdc69909165a), [`5ac6249`](https://github.com/better-auth/better-auth/commit/5ac62493ef7296b4ac89359d257a0a99305ac189), [`6d97c47`](https://github.com/better-auth/better-auth/commit/6d97c4754c80010524b922c39b28a7afd4012457)]:
  - @better-auth/oauth-provider@1.7.0

## 1.7.0-rc.6

### Patch Changes

- Updated dependencies [[`801968e`](https://github.com/better-auth/better-auth/commit/801968e354067869318718f4766d7011c0218a86), [`f451d1c`](https://github.com/better-auth/better-auth/commit/f451d1c7589ddb4d2995fa54aee9375472ebea33)]:
  - @better-auth/oauth-provider@1.7.0-rc.6

## 1.7.0-rc.5

### Patch Changes

- Updated dependencies [[`6782647`](https://github.com/better-auth/better-auth/commit/6782647d7c2d248246f9ef3980e656725c29ce64), [`a796214`](https://github.com/better-auth/better-auth/commit/a7962147b3a759ce6da542300e31f3b5705a63fa)]:
  - @better-auth/oauth-provider@1.7.0-rc.5

## 1.7.0-rc.4

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.4

## 1.7.0-rc.3

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - MCP clients that hit a scope wall now learn exactly which scopes to ask for. Missing protected scopes produce a `403` with an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge that names every missing scope. Clients can union those scopes into one authorization request instead of opening one browser redirect per scope.
  - Configure protected scopes with `requiredScopes` through `RequireMcpAuthOptions` or the matching `createMcpProtectedRequestHandler` verifier option. Exact membership remains the default; `isScopeSatisfied` can define hierarchical policies.
  - Use `createInsufficientScopeError` when an operation determines its required scopes dynamically. `createResourceServerChallenge` converts that signal and recognized token failures into safe RFC 6750 challenges.
  - Use `challengeScopes` only as the unauthenticated challenge hint.

  Handler-produced responses, ordinary permission denials, configuration failures, and unrelated thrown values keep their original status and identity.

### Patch Changes

- Updated dependencies [[`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71), [`f68044d`](https://github.com/better-auth/better-auth/commit/f68044dcfbd9fb83763249ed9509cfacbcce47be)]:
  - @better-auth/oauth-provider@1.7.0-rc.3

## 1.7.0-rc.2

### Patch Changes

- Updated dependencies [[`69acb7a`](https://github.com/better-auth/better-auth/commit/69acb7a3db3cd148a9cd1db5063dbdc69909165a)]:
  - @better-auth/oauth-provider@1.7.0-rc.2

## 1.7.0-rc.1

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.1

## 1.7.0-rc.0

### Patch Changes

- Updated dependencies []:
  - @better-auth/oauth-provider@1.7.0-rc.0

## 1.7.0-beta.7

### Minor Changes

- [#10145](https://github.com/better-auth/better-auth/pull/10145) [`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth Provider can now replay the same refresh-token response for duplicate refresh requests during a configured `refreshTokenReuseInterval`. OAuth Provider keeps strict replay handling by default; set this option to opt into the overlap window.

  The MCP plugin defaults that interval to 30 seconds for every configured client. A retried refresh can recover the response produced when another request rotated the token. OAuth Provider remains strict by default; set `refreshTokenReuseInterval: 0` on `mcp()` to disable the overlap window.

### Patch Changes

- Updated dependencies [[`5838df2`](https://github.com/better-auth/better-auth/commit/5838df2f4146433164ca16ffdba2d196a4f8ff51)]:
  - @better-auth/oauth-provider@1.7.0-beta.10

## 1.7.0-beta.6

### Minor Changes

- [#9992](https://github.com/better-auth/better-auth/pull/9992) [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The MCP plugin moves out of `better-auth` into its own package, `@better-auth/mcp`, built on `@better-auth/oauth-provider`. Import the server plugin and its helpers from `@better-auth/mcp`, and the remote client and adapters from `@better-auth/mcp/client` and `@better-auth/mcp/client/adapters` (previously imported from `better-auth/plugins` and `better-auth/plugins/mcp/client`). The OAuth endpoints move from `/mcp/*` to `/oauth2/*`, with discovery at `/.well-known/oauth-authorization-server` and protected resource metadata at `/.well-known/oauth-protected-resource`. Discovery-based MCP clients pick up the new locations on their own.

  The route helper is renamed `requireMcpAuth` (was `withMcpAuth`), and the remote client is `createMcpResourceClient` (was `createMcpAuthClient`). `requireMcpAuth` verifies the bearer token against the published JWKS and passes the verified JWT claims to your handler.

  To migrate, install `@better-auth/mcp`, add the `jwt()` plugin (now required for token signing), and move options that were nested under `oidcConfig` to flat options on `mcp({ ... })`. The database models change: `oauthApplication` becomes `oauthClient`, with new `oauthRefreshToken` and `oauthClientAssertion` tables. Regenerate or migrate your schema with `npx auth migrate` or `npx auth generate`.

- [#10039](https://github.com/better-auth/better-auth/pull/10039) [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider)!: DPoP-bound access tokens (RFC 9449)

  OAuth provider integrations can issue and verify DPoP sender-constrained tokens. Clients request them with `dpop_bound_access_tokens` at registration, `dpop_jkt` on the authorization request, or by targeting a resource configured with `dpopBoundAccessTokensRequired`. Issued tokens carry `cnf.jkt`, return `token_type: "DPoP"`, and stay bound through refresh-token rotation, introspection, and userinfo.

  Resource servers verify DPoP requests with `verifyAccessTokenRequest`, which checks the `Authorization: DPoP` scheme, the proof, the request target, the access-token hash, and proof replay. The MCP package advertises DPoP in protected resource metadata and verifies DPoP-bound requests. Proof replay is rejected through the database-backed verification store, so anti-replay holds across instances. `verifyAccessTokenRequest` and `requireMcpAuth` use that store by default; build one with `createDpopReplayStore(internalAdapter)` or pass a custom `dpop.replayStore`. This needs database-backed verification storage: a secondary-storage-only deployment rejects DPoP requests rather than skipping replay protection.

  Breaking: the raw-token verifier `verifyAccessToken` is renamed to `verifyBearerToken`, both in `better-auth/oauth2` and as the `oauthProviderResourceClient` action, and it rejects DPoP-bound tokens. Use `verifyAccessTokenRequest` on any endpoint that may receive them. The resource-request input type is renamed from `AccessTokenRequestInput` to `ResourceRequestInput`, and the DPoP algorithm option is `signingAlgorithms` everywhere.

  Run a schema migration for the DPoP token-binding fields: the `confirmation` column on the access-token and refresh-token tables. DPoP-bound clients also gain `dpopBoundAccessTokens` and resources `dpopBoundAccessTokensRequired`. No dedicated replay table is added; proof replay reuses the verification store.

- [#9648](https://github.com/better-auth/better-auth/pull/9648) [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627) Thanks [@brentmitchell25](https://github.com/brentmitchell25)! - OAuth provider now models protected resources explicitly. Configure them with `resources` or create them through the `oauthResource` admin API. Each resource can define token TTLs, allowed scopes, custom JWT claims, and JWT signing pins.

  `validAudiences` is removed. Move each existing resource identifier into `resources`; link clients that should be limited to specific resources through `oauthClientResource` or Dynamic Client Registration `resources`.

  Access-token issuance now applies resource policy to the requested RFC 8707 `resource` values. The OAuth provider narrows scopes to resource allowlists, uses the shortest configured TTL, strips reserved RFC 9068 claim names from custom claims, emits `jti`, and keeps repeated `resource` form parameters.

  Refresh-token TTLs now use the shortest applicable lifetime. Deployments with a per-resource `refreshTokenTtl` longer than `refreshTokenExpiresIn` will see refresh tokens expire at the provider default instead of the longer resource value.

  JWT signing can now honor per-resource pins. `signJWT()` accepts `signingKeyId` and `signingAlgorithm`; JWKS adapters expose `getKeyById()` and `getLatestKeyByAlg()`. The `jwks` table adds nullable `alg` and `crv` columns, and `keyPairConfigs` can provision multiple algorithms in one keyring.

  After upgrading, run `npx @better-auth/cli generate` and apply the migration before deploying. The migration adds `oauthResource`, `oauthClientResource`, and the new `jwks` columns. Without it, resources using `signingAlgorithm` cannot find matching keys.

  Resource servers should publish RFC 9728 protected-resource metadata at their own origin. The OAuth provider exposes challenge helpers that point clients at that metadata.

  `@better-auth/mcp` now requires an explicit `resource` option. The plugin stores that identifier as an OAuth resource, publishes RFC 9728 protected-resource metadata for it, and binds issued access tokens to that resource. Existing `mcp({ loginPage, consentPage })` setups should add a protected MCP resource identifier, for example `resource: "https://api.example.com/mcp"`.

### Patch Changes

- Updated dependencies [[`b36c38f`](https://github.com/better-auth/better-auth/commit/b36c38f9842d3416689340552989449a32007819), [`73541c1`](https://github.com/better-auth/better-auth/commit/73541c119041113b1909fe244ff4b8210618b5b5), [`bf39cbf`](https://github.com/better-auth/better-auth/commit/bf39cbf13f3b934f728cde72b1e7ebdc4c85f641), [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222), [`2fd3d58`](https://github.com/better-auth/better-auth/commit/2fd3d5850006d164317d4f53a81ac95f2d1f549a), [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9), [`050ef2d`](https://github.com/better-auth/better-auth/commit/050ef2dfcf22429135b49804de195f945f59f3c1), [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627), [`34558bc`](https://github.com/better-auth/better-auth/commit/34558bc52b0e043021a1072f78de5f5439ae1734), [`0143d69`](https://github.com/better-auth/better-auth/commit/0143d69195870ea6550a40add8618361dbbc3b8f), [`652fa53`](https://github.com/better-auth/better-auth/commit/652fa53e4912837fe234651e7c7705fb35abe188), [`6fe9faa`](https://github.com/better-auth/better-auth/commit/6fe9faab65eb640dbe9bb762954a068586e8661c), [`ad35ead`](https://github.com/better-auth/better-auth/commit/ad35eadd130162565a1b93c27f3a66910dca0b0e), [`6d97c47`](https://github.com/better-auth/better-auth/commit/6d97c4754c80010524b922c39b28a7afd4012457)]:
  - better-auth@1.7.0-beta.6
  - @better-auth/oauth-provider@1.7.0-beta.6
  - @better-auth/core@1.7.0-beta.6
