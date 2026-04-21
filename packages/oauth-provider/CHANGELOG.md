# @better-auth/oauth-provider

## 1.6.5

### Patch Changes

- [`5b900a2`](https://github.com/better-auth/better-auth/commit/5b900a2b43a734ecde6b624b92a4e21468376012) Thanks [@chdanielmueller](https://github.com/chdanielmueller)! - fix(oauth-provider): enforce client privilege checks on OAuth client creation

- Updated dependencies [[`938dd80`](https://github.com/better-auth/better-auth/commit/938dd80e2debfab7f7ef480792a5e63876e779d9), [`0538627`](https://github.com/better-auth/better-auth/commit/05386271ca143d07416297611d3b31e6c20e2f2a)]:
  - better-auth@1.6.5
  - @better-auth/core@1.6.5

## 1.6.4

### Patch Changes

- Updated dependencies [[`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4), [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09), [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - better-auth@1.6.4
  - @better-auth/core@1.6.4

## 1.6.3

### Patch Changes

- [#9123](https://github.com/better-auth/better-auth/pull/9123) [`e2e25a4`](https://github.com/better-auth/better-auth/commit/e2e25a49545f3e386cfcc4e86b33c1796a1430b1) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): override confidential auth methods to public in unauthenticated DCR

  When `allowUnauthenticatedClientRegistration` is enabled, unauthenticated DCR
  requests that specify `client_secret_post`, `client_secret_basic`, or omit
  `token_endpoint_auth_method` (which defaults to `client_secret_basic` per
  [RFC 7591 §2](https://datatracker.ietf.org/doc/html/rfc7591#section-2)) are
  now silently overridden to `token_endpoint_auth_method: "none"` (public client)
  instead of being rejected with HTTP 401.

  This follows [RFC 7591 §3.2.1](https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.1),
  which allows the server to "reject or replace any of the client's requested
  metadata values submitted during the registration and substitute them with
  suitable values." The registration response communicates the actual method
  back to the client, allowing compliant clients to adjust.

  This fixes interoperability with real-world MCP clients (Claude, Codex, Factory
  Droid, and others) that send `token_endpoint_auth_method: "client_secret_post"`
  in their DCR payload because the server metadata advertises it in
  `token_endpoint_auth_methods_supported`.

  Closes [#8588](https://github.com/better-auth/better-auth/issues/8588)

- [#9131](https://github.com/better-auth/better-auth/pull/9131) [`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - harden dynamic `baseURL` handling for direct `auth.api.*` calls and plugin metadata helpers

  **Direct `auth.api.*` calls**
  - Throw `APIError` with a clear message when the baseURL can't be resolved (no source and no `fallback`), instead of leaving `ctx.context.baseURL = ""` for downstream plugins to crash on.
  - Convert `allowedHosts` mismatches on the direct-API path to `APIError`.
  - Honor `advanced.trustedProxyHeaders` on the dynamic path (default `true`, unchanged). Previously `x-forwarded-host` / `-proto` were unconditionally trusted with `allowedHosts`; they now go through the same gate as the static path. The default flip to `false` ships in a follow-up PR.
  - `resolveRequestContext` rehydrates `trustedProviders` and cookies per call (in addition to `trustedOrigins`). User-defined `trustedOrigins(req)` / `trustedProviders(req)` callbacks receive a `Request` synthesized from forwarded headers when no full `Request` is available.
  - Infer `http` for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`) on the headers-only protocol fallback, so local-dev calls don't silently resolve to `https://localhost:3000`.
  - `hasRequest` uses `isRequestLike`, which now rejects objects that spoof `Symbol.toStringTag` without a real `url` / `headers.get` shape.

  **Plugin metadata helpers**
  - `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`, `oAuthDiscoveryMetadata`, and `oAuthProtectedResourceMetadata` forward the incoming request to their chained `auth.api` calls, so `issuer` and discovery URLs reflect the request host on dynamic configs.
  - `withMcpAuth` forwards the incoming request to `getMcpSession`, threads `trustedProxyHeaders`, and emits a bare `Bearer` challenge when `baseURL` can't be resolved (instead of `Bearer resource_metadata="undefined/..."`).
  - `metadataResponse` in `@better-auth/oauth-provider` normalizes headers via `new Headers()` so callers can pass `Headers`, tuple arrays, or records without silently dropping entries.

- [#9118](https://github.com/better-auth/better-auth/pull/9118) [`314e06f`](https://github.com/better-auth/better-auth/commit/314e06f0fd84ac90b55b5430624a74c5a8d62bfd) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider): add `customTokenResponseFields` callback and Zod validation for authorization codes

  Add `customTokenResponseFields` callback to `OAuthOptions` for injecting custom fields into token endpoint responses across all grant types. Standard OAuth fields (`access_token`, `token_type`, etc.) cannot be overridden. Follows the same pattern as `customAccessTokenClaims` and `customIdTokenClaims`.

  Authorization code verification values are now validated with a Zod schema at deserialization, consistently returning `invalid_verification` errors for malformed or corrupted values instead of potential 500s.

- Updated dependencies [[`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45), [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f), [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f), [`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d), [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649), [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7), [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af), [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463), [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f)]:
  - better-auth@1.6.3
  - @better-auth/core@1.6.3

## 1.6.2

### Patch Changes

- [#9060](https://github.com/better-auth/better-auth/pull/9060) [`4c829bf`](https://github.com/better-auth/better-auth/commit/4c829bf2892a7fbf9f137f9bc9972b0c8fff12b5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): preserve multi-valued query params through prompt redirects
  - `serializeAuthorizationQuery` now uses `params.append()` for array values instead of `String(array)` which collapsed them into a single comma-joined entry.
  - `deleteFromPrompt` return type widens from `Record<string, string>` to `Record<string, string | string[]>`. The previous type was incorrect — `Object.fromEntries()` silently dropped duplicate keys, so the narrower type only held because the data was being corrupted.

- [#8998](https://github.com/better-auth/better-auth/pull/8998) [`c6922dc`](https://github.com/better-auth/better-auth/commit/c6922dce8edaed9293ce8d8962fa6ec03dafb2ce) Thanks [@dvanmali](https://github.com/dvanmali)! - Typescript specifies skip_consent type never and errors through zod

- Updated dependencies [[`9deb793`](https://github.com/better-auth/better-auth/commit/9deb7936aba7931f2db4b460141f476508f11bfd), [`2cbcb9b`](https://github.com/better-auth/better-auth/commit/2cbcb9baacdd8e6fa1ed605e9b788f8922f0a8c2), [`b20fa42`](https://github.com/better-auth/better-auth/commit/b20fa424c379396f0b86f94fbac1604e4a17fe19), [`608d8c3`](https://github.com/better-auth/better-auth/commit/608d8c3082c2d6e52c6ca6a8f38348619869b1ae), [`8409843`](https://github.com/better-auth/better-auth/commit/84098432ad8432fe33b3134d933e574259f3430a), [`e78a7b1`](https://github.com/better-auth/better-auth/commit/e78a7b120d56b7320cc8d818270e20057963a7b2)]:
  - better-auth@1.6.2
  - @better-auth/core@1.6.2

## 1.6.1

### Patch Changes

- Updated dependencies [[`2e537df`](https://github.com/better-auth/better-auth/commit/2e537df5f7f2a4263f52cce74d7a64a0a947792b), [`f61ad1c`](https://github.com/better-auth/better-auth/commit/f61ad1cab7360e4460e6450904e97498298a79d5), [`7495830`](https://github.com/better-auth/better-auth/commit/749583065958e8a310badaa5ea3acc8382dc0ca2)]:
  - better-auth@1.6.1
  - @better-auth/core@1.6.1

## 1.6.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Only require storeSessionInDatabase when secondaryStorage is configured

- [#8632](https://github.com/better-auth/better-auth/pull/8632) [`e5091ee`](https://github.com/better-auth/better-auth/commit/e5091ee1e64fcbe69bdeb4ed86e774e32ca85d7d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix PAR scope loss, loopback redirect matching, and DCR skip_consent
  - **PAR (RFC 9126)**: resolve `request_uri` into stored params before processing; discard front-channel URL params per §4 to prevent prompt/scope injection
  - **Loopback (RFC 8252 §7.3)**: port-agnostic redirect URI matching for `127.0.0.1` and `[::1]`; scheme, host, path, and query must still match
  - **DCR**: accept `skip_consent` in schema but reject it during dynamic registration to prevent privilege escalation
  - **Serialization**: fix `oAuthState` query serialization and preserve non-string values like `max_age`

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Allow customIdTokenClaims to override acr and auth_time in ID tokens

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Handle dynamic baseURL config in init without crashing on object-format URLs

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Normalize session timestamps before deriving OIDC auth_time across adapter shapes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Return JSON redirects from post-login OAuth continuation to fix CORS-blocked 302 responses

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enforce database-backed sessions when secondary storage is enabled to fail fast at initialization

- Updated dependencies [[`dd537cb`](https://github.com/better-auth/better-auth/commit/dd537cbdeb618abe9e274129f1670d0c03e89ae5), [`bd9bd58`](https://github.com/better-auth/better-auth/commit/bd9bd58f8768b2512f211c98c227148769d533c5), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`469eee6`](https://github.com/better-auth/better-auth/commit/469eee6d846b32a43f36b418868e6a4c916382dc), [`560230f`](https://github.com/better-auth/better-auth/commit/560230f751dfc5d6efc8f7f3f12e5970c9ba09ea)]:
  - better-auth@1.6.0
  - @better-auth/core@1.6.0

## 1.6.0-beta.0

### Minor Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Only require storeSessionInDatabase when secondaryStorage is configured

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Allow customIdTokenClaims to override acr and auth_time in ID tokens

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Handle dynamic baseURL config in init without crashing on object-format URLs

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Normalize session timestamps before deriving OIDC auth_time across adapter shapes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Return JSON redirects from post-login OAuth continuation to fix CORS-blocked 302 responses

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enforce database-backed sessions when secondary storage is enabled to fail fast at initialization

- Updated dependencies [[`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b)]:
  - better-auth@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
