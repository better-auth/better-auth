---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Promote OAuth resources to a first-class persisted entity (`oauthResource`) with per-resource token policy: TTL, signing algorithm / key, scope allowlist, custom claims. Clients link to resources via a join table (`oauthClientResource`) replacing the flat global allowlist.

New `resources` plugin option (string or object form), `resourceSeedMode` ('insertOnly' | 'merge' | 'overwrite'), `cachedResources` opt-in cache, `enforcePerClientResources` smart default, `identifierValidator` hook (default: strict RFC 8707 §2 URI), and `resourcePrivileges` RBAC callback. Adds admin CRUD/link endpoints under `/admin/oauth2/resources`. Adds a Dynamic Client Registration `resources` metadata field for linking a new client to existing resource rows. Resource servers should publish RFC 9728 protected-resource metadata at their own origin; the provider exposes challenge helpers instead of hosting resource-server metadata from the authorization server.

Adds `jti` claim emission (RFC 9068 §2.2.4) and server-enforced stripping of reserved RFC 9068 claim names from `customClaims` and `customAccessTokenClaims` payloads (the AS owns those names).

`@better-auth` JWT plugin extension (additive, backward-compatible): `signJWT()` accepts optional `signingKeyId` and `signingAlgorithm`, plus `getKeyById()` and `getLatestKeyByAlg()` helpers on the JWKS adapter. `jwks` schema gains nullable `alg` and `crv` columns so multiple algorithms can coexist in one keyring (rows without `alg` continue to fall back to `options.jwks.keyPairConfig.alg`). New `keyPairConfigs?: JWKOptions[]` option lazy-mints additional algorithms on first per-resource pin, and the OIDC metadata endpoint advertises every configured alg in `id_token_signing_alg_values_supported`. The `jwt.sign` callback signature gains an optional `signingConfig` third argument (after the back-channel-logout `header` argument) so remote KMS integrations can honor per-resource pinning.

**Migration required** for downstream consumers: this PR adds two columns (`alg`, `crv`) to the existing `jwks` table and two new tables (`oauthResource`, `oauthClientResource`). After bumping, run `npx @better-auth/cli generate` and apply the resulting migration before deploying. Without the migration, per-resource `signingAlgorithm` pinning will fail with `signJWT: no key with alg "X" found in JWKS` since the column the resolver needs is absent.

Removes the legacy `validAudiences` option; new integrations must model protected resources through `resources` or the `oauthResource` admin API. DPoP/mTLS proof validation, JWE access tokens, and per-resource opaque-token format are reserved for follow-up PRs; their schema columns are documented as comments in `schema.ts` to keep the seam visible.

Restores RFC 8707 §2 conformance for the `/oauth2/token` endpoint: repeated `resource` form parameters (`resource=https://a&resource=https://b`) are now honored, where the upstream form-body parser had previously collapsed them to last-write-wins and silently narrowed the issued token's `aud` claim. The endpoint re-parses the raw body to recover the full ordered list before delegating to the token pipeline.

Tightens refresh-token TTL resolution to "most-restrictive wins" (OAuth 2.1 §1.5 / RFC 8693 §3.2 lifetime narrowing). Previously a per-resource `refreshTokenTtl` would override `refreshTokenExpiresIn` even when the resource value was longer; now the issued refresh-token expiry is `min(resourceRefreshTtl, refreshTokenExpiresIn)`, matching the access-token rule. Deployments whose resource rows specified a refresh TTL longer than the plugin default will see refresh-token lifetimes shrink to the AS-wide default.
