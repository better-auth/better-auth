# better-auth

## 1.7.0-rc.0

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-rc.0
  - @better-auth/drizzle-adapter@1.7.0-rc.0
  - @better-auth/kysely-adapter@1.7.0-rc.0
  - @better-auth/memory-adapter@1.7.0-rc.0
  - @better-auth/mongo-adapter@1.7.0-rc.0
  - @better-auth/prisma-adapter@1.7.0-rc.0
  - @better-auth/telemetry@1.7.0-rc.0

## 1.7.0-beta.10

### Patch Changes

- [#10170](https://github.com/better-auth/better-auth/pull/10170) [`6ddb555`](https://github.com/better-auth/better-auth/commit/6ddb5554c01da4df6c637013dac7ea4ec8a43b52) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Bundled dependencies were refreshed to their latest compatible releases, including jose, nanostores, the noble crypto packages, and SimpleWebAuthn. These updates are backward compatible and require no changes to existing projects.

- Updated dependencies [[`ea06c5a`](https://github.com/better-auth/better-auth/commit/ea06c5a71f448dfc600f1c2f7b0de732730c79cd)]:
  - @better-auth/drizzle-adapter@1.7.0-beta.10
  - @better-auth/core@1.7.0-beta.10
  - @better-auth/kysely-adapter@1.7.0-beta.10
  - @better-auth/memory-adapter@1.7.0-beta.10
  - @better-auth/mongo-adapter@1.7.0-beta.10
  - @better-auth/prisma-adapter@1.7.0-beta.10
  - @better-auth/telemetry@1.7.0-beta.10

## 1.7.0-beta.9

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.9
  - @better-auth/drizzle-adapter@1.7.0-beta.9
  - @better-auth/kysely-adapter@1.7.0-beta.9
  - @better-auth/memory-adapter@1.7.0-beta.9
  - @better-auth/mongo-adapter@1.7.0-beta.9
  - @better-auth/prisma-adapter@1.7.0-beta.9
  - @better-auth/telemetry@1.7.0-beta.9

## 1.7.0-beta.8

### Minor Changes

- [#10127](https://github.com/better-auth/better-auth/pull/10127) [`7c7313c`](https://github.com/better-auth/better-auth/commit/7c7313c8189baabd11a2ecb681bd2b16eb40fa4d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth sign-in, account linking, callback, and proxy flows now build `redirect_uri` from the current request base URL when `baseURL.allowedHosts` is configured. Built-in social providers and generic OAuth providers now use the resolved request host for redirects in multi-host deployments.

  Custom `OAuthProvider` implementations can omit `callbackPath` when using the shared `/callback/<provider-id>` route. Set `callbackPath` only for custom callback routes.

### Patch Changes

- [#10124](https://github.com/better-auth/better-auth/pull/10124) [`06daf70`](https://github.com/better-auth/better-auth/commit/06daf7011e548ef5a7d513c96e3a440331977a7d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Preserve the resolved OAuth user when `overrideUserInfo` returns `null` during account linking.

- [#10125](https://github.com/better-auth/better-auth/pull/10125) [`a83152e`](https://github.com/better-auth/better-auth/commit/a83152e2e884b1ac1724f95cea2056795d60e5cc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Create new OAuth accounts in the user creation transaction so failed account writes roll back the user row.

- [#10128](https://github.com/better-auth/better-auth/pull/10128) [`97903c9`](https://github.com/better-auth/better-auth/commit/97903c9cca47f5fa62cf1d2ab86f6228db04aff0) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Preserve previously granted OAuth scopes across sign-in re-authentication and refresh-token requests. `account.scope` now accumulates monotonically: newly granted scopes are merged in only when added via `linkSocial`, and providers returning a narrower scope claim than the user has granted no longer shrink the stored value.

- Updated dependencies [[`7c7313c`](https://github.com/better-auth/better-auth/commit/7c7313c8189baabd11a2ecb681bd2b16eb40fa4d), [`97903c9`](https://github.com/better-auth/better-auth/commit/97903c9cca47f5fa62cf1d2ab86f6228db04aff0), [`3a79aff`](https://github.com/better-auth/better-auth/commit/3a79aff58ed82e45caf04c2ee4acaf0f4d09a86c)]:
  - @better-auth/core@1.7.0-beta.8
  - @better-auth/drizzle-adapter@1.7.0-beta.8
  - @better-auth/kysely-adapter@1.7.0-beta.8
  - @better-auth/memory-adapter@1.7.0-beta.8
  - @better-auth/mongo-adapter@1.7.0-beta.8
  - @better-auth/prisma-adapter@1.7.0-beta.8
  - @better-auth/telemetry@1.7.0-beta.8

## 1.7.0-beta.7

### Minor Changes

- [#9948](https://github.com/better-auth/better-auth/pull/9948) [`3d04fab`](https://github.com/better-auth/better-auth/commit/3d04fababbf3efd4c46a4012f46ed9397715c2e3) Thanks [@yordis](https://github.com/yordis)! - feat(generic-oauth): add `refreshTokenParams` config to forward extra params on token refresh

  Multi-tenant OIDC providers (Zitadel multi-org, Auth0 with `audience`) need to send extra body params on the refresh call to rescope tokens without a full authorization redirect. The generic-oauth plugin now accepts a `refreshTokenParams` option (object or sync/async function) that is merged into the refresh request body, with `grant_type` and `refresh_token` protected from override. The function form receives request metadata for the request that triggered the refresh, so request-scoped data (headers, cookies) is available without out-of-band state like AsyncLocalStorage.

  `UpstreamProvider.refreshAccessToken` now accepts an optional second `ctx` argument; the change is backwards compatible because existing implementations that take only `refreshToken` remain valid. See [#7554](https://github.com/better-auth/better-auth/issues/7554).

### Patch Changes

- Updated dependencies [[`3d04fab`](https://github.com/better-auth/better-auth/commit/3d04fababbf3efd4c46a4012f46ed9397715c2e3), [`de8394d`](https://github.com/better-auth/better-auth/commit/de8394de207bae2fe9d0b8d7e901a196c1dc08d0)]:
  - @better-auth/core@1.7.0-beta.7
  - @better-auth/drizzle-adapter@1.7.0-beta.7
  - @better-auth/kysely-adapter@1.7.0-beta.7
  - @better-auth/memory-adapter@1.7.0-beta.7
  - @better-auth/mongo-adapter@1.7.0-beta.7
  - @better-auth/prisma-adapter@1.7.0-beta.7
  - @better-auth/telemetry@1.7.0-beta.7

## 1.7.0-beta.6

### Minor Changes

- [#10004](https://github.com/better-auth/better-auth/pull/10004) [`b36c38f`](https://github.com/better-auth/better-auth/commit/b36c38f9842d3416689340552989449a32007819) Thanks [@bytaesu](https://github.com/bytaesu)! - The captcha plugin now requires endpoint entries to match full auth paths unless they use wildcard patterns. This prevents requests like `/sign-in//email` from bypassing captcha while preserving trailing-slash matches like `/sign-in/email/`. To protect multiple routes, replace partial paths like `/sign-in` with explicit wildcards such as `/sign-in/*` or `/sign-in/**`.

- [#9766](https://github.com/better-auth/better-auth/pull/9766) [`bf39cbf`](https://github.com/better-auth/better-auth/commit/bf39cbf13f3b934f728cde72b1e7ebdc4c85f641) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Add a server-only `auth.api.consumePhoneNumberOTP` API for custom phone OTP flows that need to verify and consume a code without creating or updating users or sessions.

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

- [#8931](https://github.com/better-auth/better-auth/pull/8931) [`34558bc`](https://github.com/better-auth/better-auth/commit/34558bc52b0e043021a1072f78de5f5439ae1734) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Add opt-in JWKS-backed asymmetric JWT support for `session_data` cookie cache tokens, so services can verify cookie-cache JWTs with public keys instead of shared secrets.

- [#9134](https://github.com/better-auth/better-auth/pull/9134) [`652fa53`](https://github.com/better-auth/better-auth/commit/652fa53e4912837fe234651e7c7705fb35abe188) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The dynamic `baseURL` config now ignores `x-forwarded-host` and `x-forwarded-proto` unless you set `advanced.trustedProxyHeaders: true`.

  Requests using `baseURL: { allowedHosts }` now resolve the auth origin from `Host` by default, so forwarded headers cannot select another allowed host unless trusted proxy headers are enabled.

  **Breaking change:** if your proxy exposes the public hostname only through `x-forwarded-host`, set `advanced.trustedProxyHeaders: true`. Deployments where the proxy rewrites `Host` to the public hostname (nginx default, Vercel, Cloudflare, and Netlify) are unaffected.

  **Migration:**

  ```ts
  betterAuth({
    baseURL: { allowedHosts: [...] },
    advanced: {
      trustedProxyHeaders: true,
    },
  });
  ```

- [#10031](https://github.com/better-auth/better-auth/pull/10031) [`6fe9faa`](https://github.com/better-auth/better-auth/commit/6fe9faab65eb640dbe9bb762954a068586e8661c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Remove the deprecated `oidcProvider` plugin from `better-auth/plugins`. Migrate OIDC authorization-server integrations to `@better-auth/oauth-provider`.

- [#10036](https://github.com/better-auth/better-auth/pull/10036) [`ad35ead`](https://github.com/better-auth/better-auth/commit/ad35eadd130162565a1b93c27f3a66910dca0b0e) Thanks [@bytaesu](https://github.com/bytaesu)! - Require Google One Tap server callbacks to resolve a Google client ID before verifying ID tokens. Configure `oneTap({ clientId })` or `socialProviders.google.clientId` when using the One Tap plugin.

### Patch Changes

- [#10014](https://github.com/better-auth/better-auth/pull/10014) [`73541c1`](https://github.com/better-auth/better-auth/commit/73541c119041113b1909fe244ff4b8210618b5b5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Cloudflare Workers apps can now start when importing Better Auth subpaths such as `better-auth/db`. Beta builds were crashing during module initialization before application code ran.

- [#10065](https://github.com/better-auth/better-auth/pull/10065) [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth and device-authorization responses that carry credentials now consistently send `Cache-Control: no-store` and `Pragma: no-cache`, so proxies, CDNs, and browsers never cache them. This covers the token, introspection, and userinfo endpoints, dynamic and admin client registration, client secret rotation, and the device code and device token responses, including the error responses from those endpoints.

  Endpoints declare this with `metadata: { noStore: true }`, and the header set is exported from `@better-auth/core` as `NO_STORE_HEADERS` for responses built by hand.

- Updated dependencies [[`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9)]:
  - @better-auth/core@1.7.0-beta.6
  - @better-auth/drizzle-adapter@1.7.0-beta.6
  - @better-auth/kysely-adapter@1.7.0-beta.6
  - @better-auth/memory-adapter@1.7.0-beta.6
  - @better-auth/mongo-adapter@1.7.0-beta.6
  - @better-auth/prisma-adapter@1.7.0-beta.6
  - @better-auth/telemetry@1.7.0-beta.6

## 1.7.0-beta.5

### Minor Changes

- [#9930](https://github.com/better-auth/better-auth/pull/9930) [`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Anonymous account linking now works after social and generic OAuth sign-in in Expo and other in-app browsers, where the OAuth callback returns without the session cookie. `onLinkAccount` fires and the anonymous user is migrated; before, it was silently skipped.

  Plugins can now carry server-trusted data across an OAuth redirect with the new `addOAuthServerContext` API, read back on the callback via `getOAuthState().serverContext`. Unlike `additionalData`, it cannot be set from the request body, so it is the right place for values the server must trust.

  For `@better-auth/oauth-provider`, the post-login authorization query now travels through that server-only channel, so it can no longer be injected through `additionalData`.

- [#9645](https://github.com/better-auth/better-auth/pull/9645) [`e014029`](https://github.com/better-auth/better-auth/commit/e0140297a59ddb59cccbcb4ba46c513de8cb86a7) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - Harden the Electron OAuth flow and tighten custom-scheme trusted-origin matching.

  The Electron sign-in flow now mandates PKCE S256. Plain PKCE is rejected: the `code_challenge_method` parameter is gone and every authorization code is verified by hashing the verifier with SHA-256. The server no longer trusts an `electron-origin` header to set the request Origin. The Electron client now sends a real `Origin` (for example `myapp:/`), so upgrade the `@better-auth/electron` client and server together and make sure your app's scheme is in `trustedOrigins`. The unused `disableOriginOverride` option is removed.

  Custom-scheme entries in `trustedOrigins` now match by scheme and authority instead of string prefix. A host-less entry such as `myapp://` or `exp://` still trusts every host of that scheme, but a host-bearing entry such as `myapp://callback` matches that host exactly, so it is no longer satisfied by `myapp://callback.attacker.tld`.

- [#9966](https://github.com/better-auth/better-auth/pull/9966) [`ec8a38c`](https://github.com/better-auth/better-auth/commit/ec8a38c08f5cfe2d922be0f8a49f2d0fa84de799) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - genericOAuth providers configured with a `discoveryUrl` now verify the provider's `id_token` against its published JWKS (signature, issuer, audience, and advertised algorithms). A sign-in whose `id_token` fails verification is rejected.

  These providers also accept client-submitted id_token sign-in through `signIn.social({ idToken })`, which previously returned `ID_TOKEN_NOT_SUPPORTED`.

  Providers configured with explicit endpoints instead of `discoveryUrl` are unchanged.

- [#9828](https://github.com/better-auth/better-auth/pull/9828) [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Verify social-provider id_tokens with a single shared verifier.

  Client-submitted id_token sign-in (`signIn.social({ idToken })` and account linking) is verified by one function instead of a per-provider `verifyIdToken` method. Each provider declares an `idToken` config with a JWKS source, issuer, and audience, and the core verifier runs the signature, issuer, audience, and nonce checks. A provider that declares no config rejects the client id_token path.

  PayPal previously accepted any decodable id_token without verifying its signature. PayPal derives identity from the access token, so it now declares no `idToken` config, and the client id_token path returns `ID_TOKEN_NOT_SUPPORTED`. PayPal sign-in through the redirect flow is unchanged.

  Custom providers that implement `OAuthProvider` directly replace the removed `verifyIdToken` method with an `idToken` config:

  ```ts
  idToken: {
	jwks: createRemoteJWKSet(new URL("https://issuer.example/.well-known/jwks.json")),
	issuer: "https://issuer.example",
	audience: clientId,
  },
  ```

  For verification that cannot use a local JWKS, pass `idToken: { verify: async (token, nonce) => boolean }`. The `verifyIdToken` and `disableIdTokenSignIn` provider options are unchanged.

- [#9929](https://github.com/better-auth/better-auth/pull/9929) [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `requireEmailVerification` to OAuth provider options, for built-in social providers and the Generic OAuth plugin. When a provider reports an unverified email, the user and account are still created or linked, but no session is issued: the OAuth callback redirects with `?error=email_not_verified`, and ID token and One Tap sign-in return `403` `EMAIL_NOT_VERIFIED`. Verification emails follow the existing `emailVerification.sendOnSignUp` / `sendOnSignIn` settings.

  It is opt-in per provider and does not inherit `emailAndPassword.requireEmailVerification`, so existing social logins keep working. The gate checks the local user's verification state, so a user verified through another method keeps access. Only enable it for providers that report a trustworthy `email_verified` signal.

- [#9969](https://github.com/better-auth/better-auth/pull/9969) [`76a3342`](https://github.com/better-auth/better-auth/commit/76a33429fc2a3edcc85307bf81b9d92a95f9de6c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Signing out with `secondaryStorage` and `session.preserveSessionInDatabase` now runs your configured `session.delete` hooks and marks the preserved session row as ended. OAuth Provider access and refresh tokens bound to that session are revoked and back-channel logout is dispatched on sign-out. Previously these hooks were skipped in this setup, so the tokens stayed valid until they expired.

- [#9864](https://github.com/better-auth/better-auth/pull/9864) [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Add a `user.validateUserInfo` provisioning gate that lets applications reject an identity before a user is created or a new account is linked. It runs once at the creation step for every method that provisions a user (OAuth, SSO/SAML, email/password, magic link, email OTP, anonymous, SIWE, phone number, admin-created users, and SCIM), including stateless setups with no persistent database.

  It also re-runs when an existing OAuth or SSO user signs in again (`source.action` is `"sign-in"`), where it receives the fresh provider email and profile so a domain or org policy can reject a user whose provider identity moved out of bounds. Non-provider returning sign-ins are not re-validated.

  The callback receives the mapped `user` plus a `source` describing the `action` (`create-user`, `link-account`, or `sign-in`), the `method`, and provider metadata: `source.oauth` for OAuth providers and `source.sso` for OIDC/SAML SSO providers. Return `{ error, errorDescription }` to reject: browser flows redirect to the error URL and programmatic flows return a `403`.

### Patch Changes

- [#9898](https://github.com/better-auth/better-auth/pull/9898) [`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2) Thanks [@ItalyPaleAle](https://github.com/ItalyPaleAle)! - Add `clientAssertion` support to the Microsoft Entra ID social provider.

- [#9304](https://github.com/better-auth/better-auth/pull/9304) [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Propagate sign-out to every connected app and cut off API access immediately, via OIDC Back-Channel Logout 1.0.

  When a user's session ends at the OP (sign-out, `/oauth2/end-session`, admin revoke, ban), `@better-auth/oauth-provider` now notifies every Relying Party that holds tokens for that session. The user's API access is cut off right away, instead of access tokens staying usable until their own TTL. Each client opts in by registering a `backchannel_logout_uri` (and optionally `backchannel_logout_session_required`) via DCR or the admin client-create endpoint. The provider signs a `logout+jwt` Logout Token per client and POSTs it to that client in parallel, with a short per-RP timeout.

  **Breaking change.** Introspection of an opaque or JWT access token whose bound session has ended now returns `{ active: false }`, and `/oauth2/userinfo` rejects it with `invalid_token`. Previously the token stayed active until its own TTL. If you relied on access tokens outliving the user's session, that no longer holds.

  Refresh tokens without `offline_access` are revoked on session end; `offline_access` refresh tokens are preserved so long-lived API access can survive the browser session (OIDC Back-Channel Logout 1.0 §2.7). Access-token invalidation on session end is an additional OP hardening choice beyond §2.7, enforced by session liveness, so it holds even when the JWT plugin is disabled.

  Delivery runs through the host's background task handler when one is configured (Vercel `waitUntil`, Cloudflare `ctx.waitUntil`); without a handler it completes inline so notifications are not lost on request teardown. Configure `advanced.backgroundTasks.handler` on serverless runtimes to keep sign-out fast.

  Discovery at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` advertises `backchannel_logout_supported: true` and `backchannel_logout_session_supported: true` when the JWT plugin is enabled. Registering a `backchannel_logout_uri` rejects fragments, non-http(s) schemes, and non-HTTPS targets on confidential clients. Its SSRF host guard, which blocks private, reserved, tunneled, and cloud-metadata hosts, now also covers a `private_key_jwt` client's `jwks_uri`.

  Schema changes on `@better-auth/oauth-provider`:
  - `oauthClient.backchannelLogoutUri: string | null`
  - `oauthClient.backchannelLogoutSessionRequired: boolean`
  - `oauthAccessToken.revoked: Date | null`

  `better-auth`'s `signJWT` gains an optional `header` argument, forwarded to custom remote signers. JWT profiles that need an explicit media type, such as `typ: "logout+jwt"`, can now set it without reaching for the low-level signing primitives.

- Updated dependencies [[`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2), [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f), [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b), [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f)]:
  - @better-auth/core@1.7.0-beta.5
  - @better-auth/drizzle-adapter@1.7.0-beta.5
  - @better-auth/kysely-adapter@1.7.0-beta.5
  - @better-auth/memory-adapter@1.7.0-beta.5
  - @better-auth/mongo-adapter@1.7.0-beta.5
  - @better-auth/prisma-adapter@1.7.0-beta.5
  - @better-auth/telemetry@1.7.0-beta.5

## 1.7.0-beta.4

## 1.6.23

### Patch Changes

- [#9138](https://github.com/better-auth/better-auth/pull/9138) [`8581f97`](https://github.com/better-auth/better-auth/commit/8581f97ea0000e03edd6aa7911efabf694a9ff95) Thanks [@vladflotsky](https://github.com/vladflotsky)! - Add a pre-configured Yandex provider helper for the generic OAuth plugin.

- Updated dependencies [[`930b260`](https://github.com/better-auth/better-auth/commit/930b260cfd402e9f8886719a3ced503b9ceff7f6)]:
  - @better-auth/drizzle-adapter@1.6.23
  - @better-auth/core@1.6.23
  - @better-auth/kysely-adapter@1.6.23
  - @better-auth/memory-adapter@1.6.23
  - @better-auth/mongo-adapter@1.6.23
  - @better-auth/prisma-adapter@1.6.23
  - @better-auth/telemetry@1.6.23

## 1.6.22

### Patch Changes

- [#10239](https://github.com/better-auth/better-auth/pull/10239) [`c06a56d`](https://github.com/better-auth/better-auth/commit/c06a56d83a40bbaeac12d3a8b8b67e59f92a9110) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Magic-link and email-OTP sign-in now reset the credentials on an account whose email had never been confirmed. When verification resolves to such an account, any existing password on it is removed and its sessions are revoked before the user is signed in, so proven control of the mailbox is the source of truth for the account.

  If you signed up with email and password but first signed in through a magic link or email OTP rather than confirming the verification email, your password is cleared and you will need to set a new one through password reset.

- [#10240](https://github.com/better-auth/better-auth/pull/10240) [`3a035e9`](https://github.com/better-auth/better-auth/commit/3a035e968e27bfdee1e53ad857e5569090d9f2d1) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add account-level lockout for two-factor verification. The attempt limit applies per account across sign-in challenges and across factors: TOTP, email-OTP, and backup codes share one counter, and a successful verification resets it.

  Enabled by default: an account locks for 15 minutes after 10 consecutive failed verifications, and locked attempts return `429` with the `ACCOUNT_TEMPORARILY_LOCKED` error code. Configure it with `twoFactor({ accountLockout: { enabled, maxFailedAttempts, durationSeconds } })`.

  Run a database migration after upgrading: this adds `failedVerificationCount` and `lockedUntil` columns to the `twoFactor` table.

- Updated dependencies [[`8bd43d9`](https://github.com/better-auth/better-auth/commit/8bd43d9d8312fd9ddbfb8fb5c827cf0a0e55132d)]:
  - @better-auth/core@1.6.22
  - @better-auth/drizzle-adapter@1.6.22
  - @better-auth/kysely-adapter@1.6.22
  - @better-auth/memory-adapter@1.6.22
  - @better-auth/mongo-adapter@1.6.22
  - @better-auth/prisma-adapter@1.6.22
  - @better-auth/telemetry@1.6.22

## 1.6.21

### Patch Changes

- [#10212](https://github.com/better-auth/better-auth/pull/10212) [`e0762a1`](https://github.com/better-auth/better-auth/commit/e0762a127ce351a96614e60866b3455e6eddffa1) Thanks [@bytaesu](https://github.com/bytaesu)! - In root-mounted deployments, requests whose path does not start with the configured `basePath` now return 404 instead of resolving to an endpoint.

- [#10187](https://github.com/better-auth/better-auth/pull/10187) [`882cf9e`](https://github.com/better-auth/better-auth/commit/882cf9e592d1d305b5b78cadbb10aaeee7acd6dc) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - Admin permission changes and bans now take effect immediately for admin APIs, even when session cookie cache is enabled. Sensitive session checks also continue to work in stateless apps where signed cookies are the session record.

- [#9939](https://github.com/better-auth/better-auth/pull/9939) [`f52e1ab`](https://github.com/better-auth/better-auth/commit/f52e1ab50b60d289b64d6b06f1bff5a4358cdfd0) Thanks [@benpsnyder](https://github.com/benpsnyder)! - fixes a bug causing deviceAuthorization() throwing a ZodError at construction when called without a schema option

- [#10196](https://github.com/better-auth/better-auth/pull/10196) [`b5bec19`](https://github.com/better-auth/better-auth/commit/b5bec193a56cec2f7b71c84d71dacb632f0b96a0) Thanks [@Paola3stefania](https://github.com/Paola3stefania)! - OAuth sign-up and account-link profile sync now ignore provider profile values for user fields marked `input: false`. Input-allowed additional fields still persist from `mapProfileToUser`, and schema defaults still apply when OAuth creates a user. Apps that used `mapProfileToUser` to fill `input: false` fields should set those fields in server-side provisioning code instead.

- [#10197](https://github.com/better-auth/better-auth/pull/10197) [`816d7f9`](https://github.com/better-auth/better-auth/commit/816d7f92522518e90d437c2a366d75db56690f86) Thanks [@Paola3stefania](https://github.com/Paola3stefania)! - Google sign-in now accepts `hd: "*"` to allow any Google Workspace hosted domain while still rejecting tokens with no hosted-domain claim.

  Google One Tap now applies the configured Google hosted-domain restriction before creating a session.

- [#10192](https://github.com/better-auth/better-auth/pull/10192) [`239bcc8`](https://github.com/better-auth/better-auth/commit/239bcc836cf39c4fb409a15333be45134f9e9e65) Thanks [@bytaesu](https://github.com/bytaesu)! - Validate PayPal user info against the verified ID token subject during social sign-in.

- [#10228](https://github.com/better-auth/better-auth/pull/10228) [`1bc370a`](https://github.com/better-auth/better-auth/commit/1bc370aef5c249e82127cb9d35972101087ecde6) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The SIWE plugin no longer binds a provided email that already belongs to another account. With `anonymous` set to `false`, `/siwe/verify` previously created the new account using that email even when it was already in use; it now keeps the wallet-derived address in that case, so one email cannot be attached to two accounts.

- [#10198](https://github.com/better-auth/better-auth/pull/10198) [`570267c`](https://github.com/better-auth/better-auth/commit/570267cd5e782f018933ce3af4f51dbd250bf7de) Thanks [@rachit367](https://github.com/rachit367)! - Honor `disableMigration` on plugin schema tables. Tables flagged with `disableMigration: true` are now skipped by `better-auth generate` (Drizzle and Prisma output) and by the runtime migrator, instead of being emitted and created anyway. The flag was previously dropped while assembling the table list, so it had no effect.

- [#10182](https://github.com/better-auth/better-auth/pull/10182) [`461ca6f`](https://github.com/better-auth/better-auth/commit/461ca6fd2453a2e145fa18a1df543e435e884701) Thanks [@bytaesu](https://github.com/bytaesu)! - Only store display username fallbacks as usernames when they pass username validation during email sign-up.

- [#10183](https://github.com/better-auth/better-auth/pull/10183) [`88409b0`](https://github.com/better-auth/better-auth/commit/88409b0078c2bfddcc6503031fff333bfa045cd2) Thanks [@bytaesu](https://github.com/bytaesu)! - Require OAuth proxy profile callbacks to match an issued OAuth state before creating sessions.

- [#10203](https://github.com/better-auth/better-auth/pull/10203) [`5953157`](https://github.com/better-auth/better-auth/commit/5953157acf619bcb8233c91952b1e4072202f055) Thanks [@bytaesu](https://github.com/bytaesu)! - Rate limiting no longer trusts multi-hop `X-Forwarded-For` chains, preventing a client behind an appending proxy from spoofing the leftmost hop to bypass the per-IP rate limit. Single-value IP headers continue to work. To key the real client behind a proxy chain, set `advanced.ipAddress.trustedProxies` to your reverse-proxy IPs or CIDR ranges (the chain is walked right to left, skipping trusted hops), or point `advanced.ipAddress.ipAddressHeaders` at a single trusted client-IP header.

- [#10191](https://github.com/better-auth/better-auth/pull/10191) [`b046f9e`](https://github.com/better-auth/better-auth/commit/b046f9ec112b2cf547efea8dc870a4895602c53b) Thanks [@bytaesu](https://github.com/bytaesu)! - Rate limit client requests before plugin request handlers run.

- [#10210](https://github.com/better-auth/better-auth/pull/10210) [`ae647b4`](https://github.com/better-auth/better-auth/commit/ae647b4abe5a4d606c326f1ce0ffa2500b5424d1) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Two-factor verification now locks out after five wrong codes per sign-in challenge for TOTP and backup codes. Once the limit is reached the challenge is rejected with `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, and a new sign-in is required to try again.

  During a rolling deploy, two-factor challenges issued by the previous version may prompt the user to sign in again; this clears once the deploy completes.

- Updated dependencies [[`90d509e`](https://github.com/better-auth/better-auth/commit/90d509e0b9f72614170ad7124ae9d3a7a97d7d3a), [`816d7f9`](https://github.com/better-auth/better-auth/commit/816d7f92522518e90d437c2a366d75db56690f86), [`570267c`](https://github.com/better-auth/better-auth/commit/570267cd5e782f018933ce3af4f51dbd250bf7de), [`5953157`](https://github.com/better-auth/better-auth/commit/5953157acf619bcb8233c91952b1e4072202f055)]:
  - @better-auth/core@1.6.21
  - @better-auth/kysely-adapter@1.6.21
  - @better-auth/prisma-adapter@1.6.21
  - @better-auth/drizzle-adapter@1.6.21
  - @better-auth/memory-adapter@1.6.21
  - @better-auth/mongo-adapter@1.6.21
  - @better-auth/telemetry@1.6.21

## 1.6.20

### Patch Changes

- [#10121](https://github.com/better-auth/better-auth/pull/10121) [`21448b1`](https://github.com/better-auth/better-auth/commit/21448b1b77681e71e80ae0728d8658c936c18eb8) Thanks [@adityachaudhary99](https://github.com/adityachaudhary99)! - OAuth account-linking and create-user error logs now respect a custom `logger` configured in `betterAuth()`, instead of always being written to the default console logger.

- [#9621](https://github.com/better-auth/better-auth/pull/9621) [`8ecf238`](https://github.com/better-auth/better-auth/commit/8ecf23817f5e501bdd8ab63ad5fdf2554ff1dff5) Thanks [@dipan-ck](https://github.com/dipan-ck)! - Session refresh no longer emits a cookie Max-Age above the browser's 400-day ceiling when using a database without fractional-second precision.

- [#8734](https://github.com/better-auth/better-auth/pull/8734) [`930f534`](https://github.com/better-auth/better-auth/commit/930f5341d956bf3075f43758392a5c7f50947104) Thanks [@sleepe229](https://github.com/sleepe229)! - declare inherited APIError properties to fix TypeScript inference errors

- Updated dependencies []:
  - @better-auth/core@1.6.20
  - @better-auth/drizzle-adapter@1.6.20
  - @better-auth/kysely-adapter@1.6.20
  - @better-auth/memory-adapter@1.6.20
  - @better-auth/mongo-adapter@1.6.20
  - @better-auth/prisma-adapter@1.6.20
  - @better-auth/telemetry@1.6.20

## 1.6.19

### Patch Changes

- [#10088](https://github.com/better-auth/better-auth/pull/10088) [`de4aa52`](https://github.com/better-auth/better-auth/commit/de4aa52e991f0a56786300af3e0d9ac8331f1996) Thanks [@bytaesu](https://github.com/bytaesu)! - Session and account cache cookies near the browser's per-cookie size limit (for example with a long `cookiePrefix` or many cached fields) are now split into chunks instead of being silently dropped by the browser. A cache too large to fit even when chunked is skipped with a warning rather than failing the request, so reads fall back to the database.

- [#9995](https://github.com/better-auth/better-auth/pull/9995) [`b4b0266`](https://github.com/better-auth/better-auth/commit/b4b02660c760fe4c8889d1311a3dbf3165f88d0b) Thanks [@ElGauchooooo](https://github.com/ElGauchooooo)! - The device authorization plugin now accepts an optional `user_id` when issuing a device code via `/device/code`, pre-binding the code to that user. Only the bound user can approve or deny the code, so a publicly visible user code can no longer be claimed by someone else.

- [#10086](https://github.com/better-auth/better-auth/pull/10086) [`5bd5e1c`](https://github.com/better-auth/better-auth/commit/5bd5e1cc73d2c9c38e69011f03038b61a4312a63) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Refresh-token rotation and token revocation, two-factor backup-code regeneration, device-code claiming, and organization invitation acceptance now work on Prisma. Concurrent or repeat requests in these flows could previously return an error on Prisma instead of the expected result.

  On MongoDB servers older than 5.0, these flows and other guarded value updates (rate-limit window resets, API-key refills) no longer fail with an empty-update error.

  `@better-auth/core`: `incrementOne` now reports a clear error when called with no `increment` and no `set`.

- [#9319](https://github.com/better-auth/better-auth/pull/9319) [`581f827`](https://github.com/better-auth/better-auth/commit/581f8271fb911cea2ce74810e086709909457cd3) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(last-login-method): include domain when clearing cross-subdomain cookies

- [#10067](https://github.com/better-auth/better-auth/pull/10067) [`8407885`](https://github.com/better-auth/better-auth/commit/840788502a13d6fa4aa4540b930ddb4a99dc1ed6) Thanks [@bytaesu](https://github.com/bytaesu)! - The `oauth-popup` plugin now ignores internal OAuth state fields passed through its `additionalData` parameter, so `additionalData` only ever carries your own custom values.

- [#9555](https://github.com/better-auth/better-auth/pull/9555) [`c1a8a64`](https://github.com/better-auth/better-auth/commit/c1a8a64c146fab20c7ad0076ffdf12eff9adc17a) Thanks [@ChrisMGeo](https://github.com/ChrisMGeo)! - Fix invalid OpenAPI output for Better Auth callback, session, and passkey routes so client generators can consume the schema.

- [#10071](https://github.com/better-auth/better-auth/pull/10071) [`635f190`](https://github.com/better-auth/better-auth/commit/635f1908702d0c63cf66b4e5f054e9d527a3c8f7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Auth clients exported from wrapper packages can now be emitted in TypeScript declaration builds without extra type annotations.

- [#10070](https://github.com/better-auth/better-auth/pull/10070) [`a787e0b`](https://github.com/better-auth/better-auth/commit/a787e0b66b368a1af0b4ba17c9750c2839668246) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Single-use verification flows no longer hang on database adapters that use a one-connection pool. This fixes magic-link verification and similar token checks in connection-limited serverless database setups.

- [#9348](https://github.com/better-auth/better-auth/pull/9348) [`c2f718f`](https://github.com/better-auth/better-auth/commit/c2f718fcdeec0c1767bb8acd5fefdd3810863b0a) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: cookie cache fallback lookup

- [#8863](https://github.com/better-auth/better-auth/pull/8863) [`7d18175`](https://github.com/better-auth/better-auth/commit/7d18175637a0b95a501fde0cf3db080879367a9d) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - `sendVerificationEmail` was invoked via `runInBackgroundOrAwait`, which could defer work when `advanced.backgroundTasks.handler` is configured (so the handler could return **200** before the email callback finished) and, in the default path, **caught and logged errors without rethrowing**. User callbacks that throw `APIError` (e.g. **429** from a rate limiter) were therefore not reliably reflected in the HTTP response ([better-auth/better-auth#8757](https://github.com/better-auth/better-auth/issues/8757)).

  Now we await `sendVerificationEmailFn` so failures surface to the client with the correct status. The unauthenticated `/send-verification-email` path enforces a constant-time floor (500 ms) so that the response duration does not reveal whether the email belongs to a real unverified user.

- Updated dependencies [[`0895993`](https://github.com/better-auth/better-auth/commit/08959936d29de8a37d469e42d9077859b643d6b3), [`5bd5e1c`](https://github.com/better-auth/better-auth/commit/5bd5e1cc73d2c9c38e69011f03038b61a4312a63), [`a787e0b`](https://github.com/better-auth/better-auth/commit/a787e0b66b368a1af0b4ba17c9750c2839668246)]:
  - @better-auth/drizzle-adapter@1.6.19
  - @better-auth/core@1.6.19
  - @better-auth/mongo-adapter@1.6.19
  - @better-auth/kysely-adapter@1.6.19
  - @better-auth/memory-adapter@1.6.19
  - @better-auth/prisma-adapter@1.6.19
  - @better-auth/telemetry@1.6.19

## 1.6.18

### Patch Changes

- [#9315](https://github.com/better-auth/better-auth/pull/9315) [`9ef7240`](https://github.com/better-auth/better-auth/commit/9ef7240fec4a9d8469dd5ed24249949d3400e732) Thanks [@GautamBytes](https://github.com/GautamBytes)! - fix OpenAPI requestBody generation for intersected and default-wrapped body schemas

- [#9583](https://github.com/better-auth/better-auth/pull/9583) [`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix plugin-provided client methods and additional session fields not being inferred in composite monorepos.

- Updated dependencies [[`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c)]:
  - @better-auth/core@1.6.18
  - @better-auth/drizzle-adapter@1.6.18
  - @better-auth/kysely-adapter@1.6.18
  - @better-auth/memory-adapter@1.6.18
  - @better-auth/mongo-adapter@1.6.18
  - @better-auth/prisma-adapter@1.6.18
  - @better-auth/telemetry@1.6.18

## 1.6.17

### Patch Changes

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - When a team had a single open slot, accepting an invitation into it was wrongly rejected as over the member limit and left a dangling membership record. Two invitations accepted into a nearly-full team at the same time could also push it past its limit. Both are fixed.

- [#9482](https://github.com/better-auth/better-auth/pull/9482) [`3e99e6c`](https://github.com/better-auth/better-auth/commit/3e99e6c77ef788377a3ddb7abe790c7dc3df1493) Thanks [@bytaesu](https://github.com/bytaesu)! - `admin.setUserPassword` now creates a credential account when the target user does not have one, matching the behavior of `resetPassword`. Previously the call returned `status: true` without doing anything for users without an existing credential account (e.g., social-only or magic-link signups), so admins migrating users from another auth system or assigning an initial password to a social-only user can now do so directly without poking the `account` table.

- [`96c78c3`](https://github.com/better-auth/better-auth/commit/96c78c3e983ab3a2d914780fcc5d66d90537f9ac) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Downgrade expected auth validation failures from error logs to warnings.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Captcha provider verification requests now time out after 10 seconds and fail closed, so a slow or unreachable captcha provider can no longer tie up a request indefinitely.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A delete-account confirmation link can no longer delete the account more than once when its callback is opened concurrently.

- [#9991](https://github.com/better-auth/better-auth/pull/9991) [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Completing account deletion through `/delete-user/callback` now fails when the session has been revoked server-side, instead of proceeding within the cookie-cache window. Deployments that keep sessions only in the cookie are unaffected.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Polling for a device-authorization token can no longer redeem the same approved device code more than once when several polls arrive together.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Submitting the same email OTP from several requests at once can no longer sign in more than once or gain extra tries beyond the attempt limit.

- [#10002](https://github.com/better-auth/better-auth/pull/10002) [`ed7b6c9`](https://github.com/better-auth/better-auth/commit/ed7b6c9ac0fa2bb7f246f552b41046302ef8138c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Adding a member to a team that is already at its `maximumMembersPerTeam` limit is now rejected on every path. `addMember` with a `teamId` and `add-team-member` previously skipped the limit that invitation acceptance enforced, so they could push a team over its cap. A rejected `addMember` no longer creates the organization member.

- [#9677](https://github.com/better-auth/better-auth/pull/9677) [`e0a768c`](https://github.com/better-auth/better-auth/commit/e0a768c973f9d9ccd4aee959efcbe1fbcc2e608d) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Refactor `role.authorize` control flow while preserving existing authorization behavior.

- [#9987](https://github.com/better-auth/better-auth/pull/9987) [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8) Thanks [@bytaesu](https://github.com/bytaesu)! - Generic OAuth sign-in works again for providers whose userinfo response has no `sub` or `id` field when `mapProfileToUser` derives the account id. An empty `id` field now falls back to `sub`.

- [#9991](https://github.com/better-auth/better-auth/pull/9991) [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `getCookieCache` now returns `null` for an expired session instead of the stale session data. Middleware that calls it to gate access no longer treats an expired signed cookie as a live session.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The Have I Been Pwned plugin now checks submitted passwords against the breach database on more password-setting endpoints by default, including the email-OTP and phone-number reset-password routes and the admin create-user and set-user-password routes. A breached password can no longer be set through those routes when the plugin is enabled with its default paths.

- [#9987](https://github.com/better-auth/better-auth/pull/9987) [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8) Thanks [@bytaesu](https://github.com/bytaesu)! - Preserve the fresh account cookie issued while switching users in the same browser instead of expiring it from stale request cookie state.

- [#9991](https://github.com/better-auth/better-auth/pull/9991) [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Expired MCP access tokens are no longer accepted. A protected MCP resource now rejects a bearer token once it has expired, both on the server and through the remote client. A refresh token is accepted only when the original authorization included the `offline_access` scope.

- [#9991](https://github.com/better-auth/better-auth/pull/9991) [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The multi-session `set-active` and `revoke` endpoints now act only on the session the caller holds a signed cookie for. A request could previously activate or revoke a different session by naming its token in the request body without holding that session's cookie.

- [#9890](https://github.com/better-auth/better-auth/pull/9890) [`d9c526b`](https://github.com/better-auth/better-auth/commit/d9c526b2a57afe9e01ff25da400f1d634b4c1ac7) Thanks [@bytaesu](https://github.com/bytaesu)! - Add an experimental `oauthPopup` plugin (with `oauthPopupClient` and `signIn.popup`) for popup-based OAuth sign-in. It lets an app sign in inside a cross-site iframe by completing OAuth in a popup and handing the session token back to the opener, where the `bearer` plugin authenticates with it. The API may change while it is experimental.

- [#9991](https://github.com/better-auth/better-auth/pull/9991) [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The OIDC provider's RP-initiated logout endpoint (`/oauth2/endsession`) no longer logs a user out, or revokes their OAuth tokens, in response to a cross-site GET that carries only a session cookie. Logout authenticated by a valid `id_token_hint` is unaffected.

- [#10003](https://github.com/better-auth/better-auth/pull/10003) [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Google One Tap now requires a configured Google client ID and rejects the sign-in callback when none is set. A Google ID token issued for a different application is no longer accepted. Set the client ID on the `oneTap` plugin or on `socialProviders.google`.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A one-time token can no longer be redeemed for a session more than once when redeemed concurrently.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A password reset token can no longer change the password more than once when used from several requests at the same time.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Submitting the same phone-number OTP from several requests at once can no longer sign in more than once or gain extra tries beyond the attempt limit.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Concurrent requests can no longer slip past the configured rate limit. The in-memory rate-limit store no longer grows without bound, and the database backend removes expired entries on its own. A custom rate-limit storage may implement a new optional `consume` method for strict enforcement; without it, the previous behavior is kept and a one-time warning is logged.

- [#9987](https://github.com/better-auth/better-auth/pull/9987) [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8) Thanks [@bytaesu](https://github.com/bytaesu)! - Deleting a team no longer breaks its pending invitations. The removed team is dropped from those invitations, which stay valid for their remaining teams or as plain organization-level invitations. Accepting an invitation that still references a missing team fails without consuming the invitation.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `internalAdapter.reserveVerificationValue`. It atomically records a single-use marker (such as a replay tombstone) so that exactly one of several concurrent callers succeeds and the rest observe that the marker is already taken. Database-backed verification storage is atomic; secondary-storage-only verification is best-effort.

- [#8760](https://github.com/better-auth/better-auth/pull/8760) [`8960f5f`](https://github.com/better-auth/better-auth/commit/8960f5f3bd2f0dccbfb768d69737d8a24d793a9e) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Session refreshes now avoid duplicate `/get-session` requests from focus and other browser session events. Client hooks keep stable data references when refetches return unchanged data, reducing unnecessary renders. Unmounting during an in-flight session request no longer leaves session state stuck in a loading state.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A Sign-In with Ethereum nonce can no longer be used to sign in more than once when submitted from several requests at the same time.

- [#9979](https://github.com/better-auth/better-auth/pull/9979) [`5c289b5`](https://github.com/better-auth/better-auth/commit/5c289b52bc166be3a36ec3c112b04195dc7621d8) Thanks [@SferaDev](https://github.com/SferaDev)! - Stateless OAuth deployments can now read account info, access tokens, and refresh tokens after different server instances handle sign-in and later requests. Session refresh also keeps the OAuth account cookie instead of clearing it in that case.

- [#9990](https://github.com/better-auth/better-auth/pull/9990) [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Hardens how requests are trusted across several flows. Rate limiting is now enforced even when a client IP cannot be determined, instead of being skipped. When `baseURL` is not configured, password-reset and verification links use the current request's host rather than the host of the first request the server handled, and a request-scoped `trustedOrigins` callback no longer affects other concurrent requests. The OAuth proxy, Google One Tap, and the Expo authorization proxy reject redirect and callback targets that are not in `trustedOrigins`. Google reCAPTCHA and Cloudflare Turnstile accept optional `expectedAction` and `allowedHostnames` to reject tokens minted for a different action or hostname. Server-side fetches reject additional reserved IPv6 ranges, and malformed redirect parameters return a 400 instead of a 500.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - An expired two-factor sign-in challenge can no longer complete login with a valid TOTP, OTP, or backup code, and the same challenge can no longer create more than one session when verified concurrently.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Submitting the same two-factor OTP from several requests at once can no longer sign in more than once or gain extra tries beyond the attempt limit.

- [#9777](https://github.com/better-auth/better-auth/pull/9777) [`59e0ccb`](https://github.com/better-auth/better-auth/commit/59e0ccbedc6c336b1e77f71c62484d654fd2fca3) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Client `updateSession` calls now accept inferred custom session fields from `inferAdditionalFields`.

- [#9962](https://github.com/better-auth/better-auth/pull/9962) [`b803c61`](https://github.com/better-auth/better-auth/commit/b803c61fdcfc64be4e26bf6fa10953621f0070cc) Thanks [@Bekacru](https://github.com/Bekacru)! - Validate roles when updating an organization member. Roles are now normalized into individual tokens and checked against the configured static and dynamic roles, so unknown or malformed role values are rejected instead of being persisted.

- Updated dependencies [[`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7)]:
  - @better-auth/memory-adapter@1.6.17
  - @better-auth/kysely-adapter@1.6.17
  - @better-auth/drizzle-adapter@1.6.17
  - @better-auth/prisma-adapter@1.6.17
  - @better-auth/mongo-adapter@1.6.17
  - @better-auth/core@1.6.17
  - @better-auth/telemetry@1.6.17

## 1.6.16

### Patch Changes

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Guard protected user fields in the admin plugin behind their dedicated permissions. `/admin/create-user` now requires `user:set-role` when a `role` is supplied (top-level or via `data.role`), validates requested roles against the configured roles, requires `user:ban` for ban fields passed in `data`, and no longer lets `data` override `email`, `name`, or `role`. `/admin/update-user` now requires `user:ban` for `banned`/`banReason`/`banExpires` (revoking the user's sessions when banning and rejecting self-bans), requires the new `user:set-email` permission for `email`/`emailVerified` (with email validation, lowercasing, and uniqueness checks), and rejects `password` updates in favor of `/admin/set-user-password`. If you use a custom access control, add `set-email` to your statements and grant it (and `ban`) to roles that should be able to change those fields through `update-user`.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Require a provider account id when signing in through generic OAuth. The default userinfo handler previously fell back to an empty string when the provider response had no `sub` (or `id`), and the callback never checked the resolved account id. With certain non-OIDC providers that omit `sub`, accounts could be stored under the same empty id and a later sign-in could resolve to an existing account. The generic OAuth callback now rejects sign-in when no account id can be resolved, the default userinfo handler returns no profile when neither `sub` nor `id` is present, and the built-in OAuth callback also rejects an empty account id.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Scope organization invitation team IDs to the invited organization. `createInvitation` now validates that every requested `teamId` belongs to the invitation's organization regardless of whether `teams.maximumMembersPerTeam` is set, and `acceptInvitation` re-checks each stored team's organization before adding team membership. Previously, with the default unlimited team size, a team ID from another organization could be stored on an invitation and applied on acceptance.

- [#9973](https://github.com/better-auth/better-auth/pull/9973) [`87e7aa5`](https://github.com/better-auth/better-auth/commit/87e7aa5e0fd8f19b326beb5bec409a9ed1f245ca) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Email sign-in and sign-up now validate the `Origin` or `Referer` header against `trustedOrigins` even when the request carries no cookies. Requests that send no `Origin`/`Referer` header and no Fetch Metadata (such as curl or server-to-server clients) are unaffected. A non-browser client that sends an untrusted `Origin`/`Referer` without cookies now receives a 403 and must add that origin to `trustedOrigins`.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Require `/refresh-token` to only trust the account cookie when its `userId`, `providerId` and (when supplied) `accountId` match the resolved session user.

- [#9967](https://github.com/better-auth/better-auth/pull/9967) [`893cf6c`](https://github.com/better-auth/better-auth/commit/893cf6cb3f1f2669b39f6ac8d3d49cf830e5732e) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Deleting a session now immediately stops `/update-session` and the account token endpoints (`/get-access-token`, `/refresh-token`, `/account-info`) from accepting it, when cookie cache is enabled alongside a database or secondary storage. Before, these routes kept serving the deleted session from the cached cookie until the cache expired. Deployments that store the session only in the cookie are unaffected.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Bind the SIWE signed message to server state before creating a session. Previously `/siwe/verify` only checked that a nonce row existed for the wallet address and then delegated entirely to `verifyMessage`. Since the documented `verifyMessage` (viem) performs signature recovery only — without inspecting the message body — a signature the wallet produced for a different message (an earlier nonce, another domain, or arbitrary content) could also satisfy verification against a freshly minted nonce.

  The plugin now parses the ERC-4361 message itself and requires its nonce, domain, address, and chain ID to match the server-issued nonce and configured `domain`, and enforces the message's `Expiration Time` / `Not Before` bounds, before verifying the signature. `message` must now be a valid ERC-4361 message (which all standard SIWE clients produce); non-conforming or mismatched messages are rejected with a 401 (`UNAUTHORIZED_SIWE_MESSAGE_MISMATCH`, `UNAUTHORIZED_SIWE_MESSAGE_EXPIRED`, or `UNAUTHORIZED_SIWE_MESSAGE_NOT_YET_VALID`). `verifyMessage` implementations should continue to perform signature recovery only.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Separate SSO provider ids from the account-linking provider namespace used for social/OAuth providers. Previously an SSO provider registered with an id matching a configured `accountLinking.trustedProviders` entry (e.g. `google`) was treated as a trusted provider and could implicitly link to an existing verified account with the same email.

  SSO registration now rejects provider ids that collide with a configured social provider, a `trustedProviders` entry, or a reserved built-in id. In addition, the OIDC and SAML callbacks no longer derive trust from a `trustedProviders` name match — SSO trust comes solely from verified domain ownership (`domainVerified`). `handleOAuthUserInfo` gains a `trustProviderByName` option (default `true`, preserving social-provider behavior) that the SSO plugin sets to `false`.

- [#9965](https://github.com/better-auth/better-auth/pull/9965) [`5e49c56`](https://github.com/better-auth/better-auth/commit/5e49c56a9e12a9b6b3fd1202bbc7a2fc97aeeafd) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Passing `activeOrganizationId`, `activeTeamId`, or `impersonatedBy` to `/update-session` now returns a 400. Change these plugin-managed session fields through their dedicated endpoints instead, such as `organization.setActive`.

- Updated dependencies [[`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15)]:
  - @better-auth/core@1.6.16
  - @better-auth/drizzle-adapter@1.6.16
  - @better-auth/kysely-adapter@1.6.16
  - @better-auth/memory-adapter@1.6.16
  - @better-auth/mongo-adapter@1.6.16
  - @better-auth/prisma-adapter@1.6.16
  - @better-auth/telemetry@1.6.16

## 1.6.15

### Patch Changes

- [#9875](https://github.com/better-auth/better-auth/pull/9875) [`1012b69`](https://github.com/better-auth/better-auth/commit/1012b690466ccd7078441dbfb406eef166fca805) Thanks [@WilsonnnTan](https://github.com/WilsonnnTan)! - The admin plugin's `unbanUser`, `setRole` and `adminUpdateUser` endpoints used to call `internalAdapter.updateUser` without checking that the target user existed, so when the caller passed an unknown id the underlying database error (for example Prisma's `P2025`) bubbled up as a generic HTTP 500. those endpoints now mirror the existing guard in `banUser`: look the user up via `findUserById`, and throw a clean `NOT_FOUND` (`USER_NOT_FOUND`) when no row is returned. Closes [#9800](https://github.com/better-auth/better-auth/issues/9800).

- [#9865](https://github.com/better-auth/better-auth/pull/9865) [`ad60333`](https://github.com/better-auth/better-auth/commit/ad60333d1517142d688c61b6ccee14b4c30864ae) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - list-session endpoint now requires a fresh-age session check.

- [#9811](https://github.com/better-auth/better-auth/pull/9811) [`0933c05`](https://github.com/better-auth/better-auth/commit/0933c050ff8735466a273347c9aab0fdd8cd38ff) Thanks [@zeroknowledge0x](https://github.com/zeroknowledge0x)! - Restore Kysely 0.28 and 0.29 compatibility for SQLite dialect introspection. The dialects now mirror Kysely's stable migration table names locally, avoiding strict ESM build failures in Turbopack without forcing consumers onto Kysely 0.29.

- [#9919](https://github.com/better-auth/better-auth/pull/9919) [`b0ddfd3`](https://github.com/better-auth/better-auth/commit/b0ddfd3433cafac312ee99ec5fb7dbb9a240da35) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Run configured hooks through the whole OAuth sign-in flow

  `hooks.before` / `hooks.after` configured on the auth instance now run for the OAuth authorization that continues after a user signs in, selects an account, or consents. They were being skipped there.

  Headers or cookies a `hooks.before` sets before returning its own response are no longer dropped, and a `hooks.after` that throws an `APIError` no longer loses either its cookies or the error's headers.

- Updated dependencies []:
  - @better-auth/core@1.6.15
  - @better-auth/drizzle-adapter@1.6.15
  - @better-auth/kysely-adapter@1.6.15
  - @better-auth/memory-adapter@1.6.15
  - @better-auth/mongo-adapter@1.6.15
  - @better-auth/prisma-adapter@1.6.15
  - @better-auth/telemetry@1.6.15

## 1.6.14

### Patch Changes

- [#9877](https://github.com/better-auth/better-auth/pull/9877) [`2d9781a`](https://github.com/better-auth/better-auth/commit/2d9781a83ddc7b51ecffbd7d24c28e4b917e2323) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Restore the normal emailed-invitation flow while documenting the stricter verification posture for organization invitations.

  Client-side `listUserInvitations` now always requires a verified session email because it enumerates invitation IDs from `session.user.email`. The `requireEmailVerificationOnInvitation` option now controls recipient calls that carry an invitation ID (`acceptInvitation`, `rejectInvitation`, `getInvitation`). When unset, Better Auth keeps the emailed-invitation sign-up flow for built-in opaque invitation IDs, including the default generator or `advanced.database.generateId: "uuid"`, and requires verified email when invitation IDs are externally controlled or predictable, such as `advanced.database.generateId: "serial"` / `false` or custom ID generation. Apps that expose invitation IDs outside the invited user's mailbox, expose organization invitation lists to members, or require stricter ownership proof should set `requireEmailVerificationOnInvitation: true` or require verified email before sign-in.

- [#9841](https://github.com/better-auth/better-auth/pull/9841) [`5a2d642`](https://github.com/better-auth/better-auth/commit/5a2d642bc7d940f4242df9b304818a8653ea2a10) Thanks [@bytaesu](https://github.com/bytaesu)! - Optional fields (`required: false`) now accept `null`, not just omission. The
  generated input validation previously rejected `null` even though the column is
  nullable, so a nullable field could not be cleared by passing `null`.

- [#9845](https://github.com/better-auth/better-auth/pull/9845) [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

- [#9806](https://github.com/better-auth/better-auth/pull/9806) [`9d3450a`](https://github.com/better-auth/better-auth/commit/9d3450ae23e8387d24adfb7bb1cb24cc6965b6e3) Thanks [@bytaesu](https://github.com/bytaesu)! - `getSessionCookie` now prefers the `__Secure-` cookie when both it and a non-secure cookie are present, so the non-secure cookie no longer shadows the current session cookie.

- Updated dependencies [[`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - @better-auth/core@1.6.14
  - @better-auth/drizzle-adapter@1.6.14
  - @better-auth/kysely-adapter@1.6.14
  - @better-auth/memory-adapter@1.6.14
  - @better-auth/mongo-adapter@1.6.14
  - @better-auth/prisma-adapter@1.6.14
  - @better-auth/telemetry@1.6.14

## 1.6.13

### Minor Changes

- [#9305](https://github.com/better-auth/better-auth/pull/9305) [`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth): per-request `additionalParams` and `loginHint` parity across `signIn.social`, `linkSocial`, and `signIn.sso`

  Unified escape hatch for customizing the provider authorization URL on a per-request basis. Previously, dynamic parameters like Google's `access_type=offline` / `prompt=consent`, Cognito's `identity_provider=Google`, or Microsoft's `domain_hint` could only be set as static server configuration.

  ### New capabilities
  - `signIn.social`, `linkSocial`, and `signIn.sso` accept `additionalParams: Record<string, string>`. Values are appended to the authorization URL as query parameters.
  - `linkSocial` also accepts `loginHint`, matching the surface of `signIn.social` and `signIn.sso`.
  - `OAuthProvider.createAuthorizationURL` gains `additionalParams` in its input contract; every built-in provider forwards it to the shared helper.
  - Generic-OAuth providers merge call-time `additionalParams` with the config-level `authorizationUrlParams`; call-time wins on key collision.
  - Cognito exposes a typed `identityProvider?: string` config option that maps to the `identity_provider` query parameter, avoiding magic strings.

  ### Security
  - The shared `createAuthorizationURL` helper silently drops any caller-supplied key in `RESERVED_AUTHORIZATION_PARAMS` (`state`, `client_id`, `redirect_uri`, `response_type`, `code_challenge`, `code_challenge_method`, `scope`). The request-body Zod schema rejects the same keys with 400, so misuse is visible at the edge rather than silently overriding security-critical parameters.
  - Providers that use non-standard client identifiers (`wechat` → `appid`, `tiktok` → `client_key`) additionally filter those keys so a caller cannot swap the configured OAuth app.
  - Provider protocol constants that are required for the integration to function (`atlassian` → `audience`, `notion` → `owner`) are merged last so caller-supplied `additionalParams` cannot override them. Configured defaults that represent operator intent (e.g. Google `include_granted_scopes`, Cognito `identityProvider`) remain caller-overridable.
  - `signIn.sso` rejects `additionalParams` with 400 when the resolved provider is SAML; the SAML AuthnRequest is signed and cannot carry caller-supplied query parameters, so silently dropping them would mislead integrators.

  ### OpenAPI
  - Added `ZodRecord` handling to the OpenAPI generator so `z.record()` fields emit `type: object` with typed `additionalProperties`. Incidentally fixes a long-standing bug where `additionalData` was rendered as `type: string`.

  ### Refactors
  - `discord`, `roblox`, `zoom`, and `slack` providers now delegate to the shared `createAuthorizationURL` helper and inherit its RFC behavior and reserved-key guard.
  - `tiktok` and `wechat` keep their manual URL construction (non-standard OAuth2 parameter names and URL fragment requirements) but thread `additionalParams` with the same reserved-key filter.

  Closes [#2351](https://github.com/better-auth/better-auth/issues/2351).
  Closes [#5441](https://github.com/better-auth/better-auth/issues/5441).
  Closes [#5592](https://github.com/better-auth/better-auth/issues/5592).
  Closes [#5604](https://github.com/better-auth/better-auth/issues/5604).
  Supersedes [#4992](https://github.com/better-auth/better-auth/issues/4992) and [#5443](https://github.com/better-auth/better-auth/issues/5443).

- [#9657](https://github.com/better-auth/better-auth/pull/9657) [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden `private_key_jwt` and token endpoint client authentication, and add the helpers that make the fix structural.

  `@better-auth/core/oauth2` now exposes `encodeBasicCredentials` and `decodeBasicCredentials`, a round-trip-tested pair that follows RFC 6749 §2.3.1 (`application/x-www-form-urlencoded` each value, split on the first `:` only). The decoder accepts the scheme case-insensitively and tolerates one or more spaces before the credentials per RFC 7235 §2.1. `client_secret_basic` on the client side and the Better Auth OAuth provider on the server side both go through these helpers, so credentials containing reserved characters round-trip cleanly across the stack and headers like `basic xxx` or `Basic  xxx` are accepted.

  `createPrivateKeyJwtClientAssertionGetter` validates options eagerly. Unsupported algorithms (`HS256`, `none`), a JWK with no key material, and disagreement between an explicit `algorithm` and the JWK-embedded `alg` all throw at construction rather than on the first token request. `signPrivateKeyJwtClientAssertion` enforces the same checks for direct callers. **Breaking:** configurations that paired an unsupported JWK `alg` with a different explicit `algorithm` used to silently sign with the explicit option; they now fail at construction.

  `@better-auth/oauth-provider` rejects empty `jwks` payloads at the schema layer (`jwks: []` and `jwks: { keys: [] }`) so the documented client metadata contract matches what `checkOAuthClient` already enforces at runtime. Schema consumers (TypeScript, OpenAPI, generated SDKs) now see the constraint.

  The SSO `private_key_jwt` flow redirects with `error_description=no_private_key_available` when a `resolvePrivateKey` callback returns no `privateKeyJwk` or `privateKeyPem`. The redirect path previously short-circuited only when the resolver was absent entirely; an empty resolver return fell through into an internal signing error.

  `better-auth/test` adds `getHttpTestInstance`, a counterpart to `getTestInstance` that binds a real HTTP listener on an OS-assigned port and constructs the auth instance against the discovered URL. It removes the temp-server-then-rebind race that test files have been individually copy-pasting.

### Patch Changes

- [#9301](https://github.com/better-auth/better-auth/pull/9301) [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `allowIdpInitiated` to `GenericOAuthConfig` and SSO `OIDCConfig` to support providers that initiate OAuth without a `state` parameter (e.g. Clever). When enabled, stateless callbacks restart the OAuth flow server-side with fresh state and PKCE, preserving CSRF protection. Also hardens `parseState` against undefined request bodies on GET callbacks.

- [#9845](https://github.com/better-auth/better-auth/pull/9845) [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

- Updated dependencies [[`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8), [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - @better-auth/core@1.7.0-beta.4
  - @better-auth/drizzle-adapter@1.7.0-beta.4
  - @better-auth/kysely-adapter@1.7.0-beta.4
  - @better-auth/memory-adapter@1.7.0-beta.4
  - @better-auth/mongo-adapter@1.7.0-beta.4
  - @better-auth/prisma-adapter@1.7.0-beta.4
  - @better-auth/telemetry@1.7.0-beta.4

## 1.7.0-beta.3

### Minor Changes

- [#8733](https://github.com/better-auth/better-auth/pull/8733) [`4e8e4c7`](https://github.com/better-auth/better-auth/commit/4e8e4c7fc5fb2723144cbf41c4a1bfa28de8d671) Thanks [@bytaesu](https://github.com/bytaesu)! - Add `hydrateSession` to seed the client with a server-fetched session so `useSession` returns data on the first render.

- [#9431](https://github.com/better-auth/better-auth/pull/9431) [`523f95c`](https://github.com/better-auth/better-auth/commit/523f95c10db24b790bbd75fe85c86c34d3465267) Thanks [@pi0](https://github.com/pi0)! - feat: make `Auth` instance fetchable

- [#9240](https://github.com/better-auth/better-auth/pull/9240) [`729c00d`](https://github.com/better-auth/better-auth/commit/729c00d74c94f558893da1e3a9ee86451d1b23da) Thanks [@adrianmxb](https://github.com/adrianmxb)! - feat(username): add immutable username option

  This allows users to set their username during sign-up or first update, but prevents changing it to a different value afterwards. Users can still update other profile fields.

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.3
  - @better-auth/drizzle-adapter@1.7.0-beta.3
  - @better-auth/kysely-adapter@1.7.0-beta.3
  - @better-auth/memory-adapter@1.7.0-beta.3
  - @better-auth/mongo-adapter@1.7.0-beta.3
  - @better-auth/prisma-adapter@1.7.0-beta.3
  - @better-auth/telemetry@1.7.0-beta.3

## 1.7.0-beta.2

### Minor Changes

- [#8977](https://github.com/better-auth/better-auth/pull/8977) [`954b664`](https://github.com/better-auth/better-auth/commit/954b664f4f251f8dd028451dab3ab43067dbf890) Thanks [@ruban-s](https://github.com/ruban-s)! - allow passing `userId` and `organizationId` to the `listUserTeams` API. `userId` lets callers list teams for another member of an organization (gated behind the `member:update` permission). `organizationId` scopes the result to a specific organization without needing to switch the session's active organization, matching the pattern used by `addTeamMember`/`removeTeamMember`.

### Patch Changes

- [#9205](https://github.com/better-auth/better-auth/pull/9205) [`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(two-factor): revert enforcement broadening from [#9122](https://github.com/better-auth/better-auth/issues/9122)

  Restores the pre-[#9122](https://github.com/better-auth/better-auth/issues/9122) enforcement scope. 2FA is challenged only on `/sign-in/email`, `/sign-in/username`, and `/sign-in/phone-number`, matching the behavior that shipped through v1.6.2. Non-credential sign-in flows (magic link, email OTP, OAuth, SSO, passkey, SIWE, one-tap, phone-number OTP, device authorization, email-verification auto-sign-in) are no longer gated by a 2FA challenge by default.

  A broader enforcement scope with per-method opt-outs and alignment to NIST SP 800-63B-4 authenticator assurance levels is planned for a future minor release.

- [#9068](https://github.com/better-auth/better-auth/pull/9068) [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix forced UUID user IDs from create hooks being ignored on PostgreSQL adapters when `advanced.database.generateId` is set to `"uuid"`.

- [#9165](https://github.com/better-auth/better-auth/pull/9165) [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - chore(adapters): require patched `drizzle-orm` and `kysely` peer versions

  Narrows the `drizzle-orm` peer to `^0.45.2` and the `kysely` peer to `^0.28.14`. Both new ranges track the minor line that carries the vulnerability fix and nothing newer, so the adapters only advertise support for versions that have actually been tested against. Consumers on older ORM releases see an install-time warning and can upgrade alongside the adapter; the peer is marked optional, so installs do not hard-fail.

- Updated dependencies [[`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - @better-auth/drizzle-adapter@1.7.0-beta.2
  - @better-auth/kysely-adapter@1.7.0-beta.2
  - @better-auth/core@1.7.0-beta.2
  - @better-auth/memory-adapter@1.7.0-beta.2
  - @better-auth/mongo-adapter@1.7.0-beta.2
  - @better-auth/prisma-adapter@1.7.0-beta.2
  - @better-auth/telemetry@1.7.0-beta.2

## 1.7.0-beta.1

### Minor Changes

- [#9069](https://github.com/better-auth/better-auth/pull/9069) [`c7d2253`](https://github.com/better-auth/better-auth/commit/c7d22539ec4f7322d9625ae2953d397c3863d097) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Rewrite the generic OAuth plugin as a first-class social provider with OAuth 2.1 security defaults. Providers now use `signIn.social` + `callback/:id` instead of dedicated plugin endpoints, with PKCE required by default (OAuth 2.1), RFC 9207 issuer validation, OIDC auto-discovery with `openid` scope injection, and typed provider IDs.

  **Breaking changes:**
  - `signIn.oauth2({ providerId })` replaced by `signIn.social({ provider })`
  - `oauth2.link()` replaced by `linkSocial()`
  - Callback URL changed from `/api/auth/oauth2/callback/:id` to `/api/auth/callback/:id`
  - `genericOAuthClient()` removed; generic OAuth providers now use the standard social client APIs
  - `pkce` defaults to `true` (was `false`); set `pkce: false` for providers that reject PKCE
  - `authorizationUrlParams` and `tokenUrlParams` only accept `Record<string, string>`
  - `issuer` and `requireIssuerValidation` config fields removed; issuer validation is automatic via OIDC discovery
  - `mapProfileToUser` profile typed as `OAuth2UserInfo & Record<string, unknown>`

- [#9079](https://github.com/better-auth/better-auth/pull/9079) [`6f2948e`](https://github.com/better-auth/better-auth/commit/6f2948e87bb5fa14bd2174a91f7143e1eced1b87) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(oauth-provider): compute `at_hash` in ID tokens per OIDC Core §3.1.3.6

  ID tokens issued alongside an access token now include the `at_hash` claim, which cryptographically binds the two tokens to prevent token substitution attacks. The hash algorithm is selected based on the actual signing key's algorithm (EdDSA/Ed25519 uses SHA-512, RS/ES/PS384 uses SHA-384, RS/ES/PS512 uses SHA-512, all others use SHA-256).

  A new `resolveSigningKey()` export is available from `better-auth/plugins` to resolve the current JWKS signing key (including its algorithm). When using a custom `jwt.sign` callback, the signed ID token's header is validated against the declared algorithm to prevent `at_hash` mismatches.

### Patch Changes

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

- [#9122](https://github.com/better-auth/better-auth/pull/9122) [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(two-factor): enforce 2FA on all sign-in paths

  The 2FA after-hook now triggers on any endpoint that creates a new session, covering magic-link, OAuth, passkey, email-OTP, SIWE, and all future sign-in methods. Authenticated requests (session refreshes, profile updates) are excluded.

- [#7231](https://github.com/better-auth/better-auth/pull/7231) [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f) Thanks [@Byte-Biscuit](https://github.com/Byte-Biscuit)! - fix(two-factor): preserve backup codes storage format after verification

  After using a backup code, remaining codes are now re-saved using the same `storeBackupCodes` strategy (plain, encrypted, or custom) configured by the user. Previously, codes were always re-encrypted with the built-in symmetric encryption, breaking subsequent verifications for plain or custom storage modes.

- [#9078](https://github.com/better-auth/better-auth/pull/9078) [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(client): prevent isMounted race condition causing many rps

- [#9113](https://github.com/better-auth/better-auth/pull/9113) [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af) Thanks [@bytaesu](https://github.com/bytaesu)! - resolve dynamic `baseURL` from request headers on direct `auth.api` calls

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.1
  - @better-auth/drizzle-adapter@1.7.0-beta.1
  - @better-auth/kysely-adapter@1.7.0-beta.1
  - @better-auth/memory-adapter@1.7.0-beta.1
  - @better-auth/mongo-adapter@1.7.0-beta.1
  - @better-auth/prisma-adapter@1.7.0-beta.1
  - @better-auth/telemetry@1.7.0-beta.1

## 1.7.0-beta.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `private_key_jwt` (RFC 7523) client authentication across the stack. Servers verify JWT client assertions signed with asymmetric keys; clients sign them for authorization code, refresh, and client credentials flows.

- [#9057](https://github.com/better-auth/better-auth/pull/9057) [`544f1c6`](https://github.com/better-auth/better-auth/commit/544f1c63c9826831d96a126fbe568d8a8a8fde68) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - feat(two-factor)!: add OTP-only enablement and remove `skipVerificationOnEnable`

  `enableTwoFactor` now accepts a `method` parameter (`"otp" | "totp"`, default `"totp"`) and returns a discriminated response with a `method` field.

  ### `method: "otp"`
  - Sets `twoFactorEnabled: true` immediately.
  - Returns `{ method: "otp" }`.
  - Requires `otpOptions.sendOTP` to be configured on the server; rejects with `OTP_NOT_CONFIGURED` otherwise.

  ### `method: "totp"` (default)
  - Returns `{ method: "totp", totpURI, backupCodes }`.
  - Rejects with `TOTP_NOT_CONFIGURED` if `totpOptions.disable` is set.

  ### Breaking changes
  - **Removed `skipVerificationOnEnable`**: use `method: "otp"` for immediate activation, or the standard TOTP verification flow.
  - **Response shape changed**: `enableTwoFactor` includes a `method` field in the response (`"otp"` or `"totp"`).

### Patch Changes

## 1.6.10

### Patch Changes

- [#8339](https://github.com/better-auth/better-auth/pull/8339) [`1e0f26d`](https://github.com/better-auth/better-auth/commit/1e0f26d4c83608d14a533f33458ade0f8504fd16) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(captcha): breaks email-otp flow

- [#9484](https://github.com/better-auth/better-auth/pull/9484) [`8c1e917`](https://github.com/better-auth/better-auth/commit/8c1e91757d91d103c332e90201c39ce5892c37e8) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: warn for cookie-plugin being last in array

- [#9437](https://github.com/better-auth/better-auth/pull/9437) [`b2d655c`](https://github.com/better-auth/better-auth/commit/b2d655c77c7c627ada17456d1de106fdce6fa18e) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Allow organization invitation role input types to accept dynamic access control roles.

- [#9497](https://github.com/better-auth/better-auth/pull/9497) [`09f1327`](https://github.com/better-auth/better-auth/commit/09f1327acb9c6bbfeb272dc62c7013172cf33153) Thanks [@bytaesu](https://github.com/bytaesu)! - Endpoints that set cookies before redirecting (such as social sign-in
  callbacks and magic-link verification) no longer emit each `Set-Cookie`
  entry twice on the response.

- [#9387](https://github.com/better-auth/better-auth/pull/9387) [`906b7b3`](https://github.com/better-auth/better-auth/commit/906b7b34a710d49798e166395da2bcd2be13ef46) Thanks [@bytaesu](https://github.com/bytaesu)! - The bearer plugin now produces a single entry per cookie name when merging
  its session token into the request `Cookie` header. Previously the merged
  header could carry two entries for the same name if the request already
  had a stale session cookie, which would surface to downstream code that
  picks the first occurrence.

- [#9475](https://github.com/better-auth/better-auth/pull/9475) [`e9c978e`](https://github.com/better-auth/better-auth/commit/e9c978e2af9e61d35f50fd040305cbb8fdda32ba) Thanks [@jaydeep-pipaliya](https://github.com/jaydeep-pipaliya)! - fix(username): respect callbackURL on `/sign-in/username`

  The endpoint accepted a `callbackURL` body field but ignored it, so
  `authClient.signIn.username({ ..., callbackURL })` silently did nothing
  while `authClient.signIn.email` redirected as expected. The handler now
  sets a `Location` header when `callbackURL` is provided and returns
  `{ redirect, url }` alongside `token`/`user`, matching the email flow.

- [#9440](https://github.com/better-auth/better-auth/pull/9440) [`e71aad3`](https://github.com/better-auth/better-auth/commit/e71aad3b6d67502cfb770fa8890f3ab58c537114) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Clear organization active hook state after sign-out so `useActiveMemberRole` does not retain a previous user's role in SPA sign-out/sign-in flows.

- [#9402](https://github.com/better-auth/better-auth/pull/9402) [`80a655d`](https://github.com/better-auth/better-auth/commit/80a655d271dcae5f785a70f13be60f80fb828cf1) Thanks [@onmax](https://github.com/onmax)! - Revalidate the client session after admin impersonation starts or stops.

- [#9503](https://github.com/better-auth/better-auth/pull/9503) [`15ff28a`](https://github.com/better-auth/better-auth/commit/15ff28a957a18df8ecd2aa08d66b94c91ae9a6a4) Thanks [@bytaesu](https://github.com/bytaesu)! - `internalAdapter.deleteAccount` parameter renamed from `accountId` to `id` to reflect that it queries by primary key, not the `accountId` column. No runtime behavior change.

- [#9268](https://github.com/better-auth/better-auth/pull/9268) [`88a7c67`](https://github.com/better-auth/better-auth/commit/88a7c678f4db3f7da580d53071b2595b92354a45) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: openAPI schema for POST /sign-in/social mis-declares required fields

- [#8839](https://github.com/better-auth/better-auth/pull/8839) [`9a7b51d`](https://github.com/better-auth/better-auth/commit/9a7b51d0d3dfbc6b2697fe5f9edd0bb480bdf89b) Thanks [@dipan-ck](https://github.com/dipan-ck)! - Apply email enumeration protection when `emailAndPassword.autoSignIn` is false. Duplicate sign-ups now return a synthetic user (`token: null`) and trigger `onExistingUserSignUp`, and new sign-ups skip auto sign-in (`token: null`)—even without `requireEmailVerification`, aligning with the docs.

- [#9065](https://github.com/better-auth/better-auth/pull/9065) [`1b25902`](https://github.com/better-auth/better-auth/commit/1b259024dcd1bbbc08559ee057f22c01929a72a7) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - non-ASCII error_description in generic-oauth callback routes causes TypeError on redirect

- [#9349](https://github.com/better-auth/better-auth/pull/9349) [`cf59136`](https://github.com/better-auth/better-auth/commit/cf591360e72a8d01741618cd61cdeea84cf8398a) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(organization): re-export field types to prevent TS2742 with additionalFields

- [#9453](https://github.com/better-auth/better-auth/pull/9453) [`a597ee0`](https://github.com/better-auth/better-auth/commit/a597ee01ed4e6d85aba5ee9f15100acc578390d9) Thanks [@mausic](https://github.com/mausic)! - The organization plugin's `cancelPendingInvitationsOnReInvite` option now actually cancels the prior pending invitation when re-inviting the same email. Previously the option had no effect — re-inviting always failed with `USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION`

- [#9456](https://github.com/better-auth/better-auth/pull/9456) [`fc02ced`](https://github.com/better-auth/better-auth/commit/fc02cedb708e2b5987a177539a903cc35155a426) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Reject OAuth callbacks when provider user info omits the account id to avoid linking accounts under the literal `undefined` id.

- [#9461](https://github.com/better-auth/better-auth/pull/9461) [`9f1ef1f`](https://github.com/better-auth/better-auth/commit/9f1ef1f7e5500e0b3dbe2a18e25e3519847cd7a9) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Expose `authClient.siwe.getNonce()` as a compatibility alias for the SIWE nonce endpoint.

- [#9369](https://github.com/better-auth/better-auth/pull/9369) [`36ef808`](https://github.com/better-auth/better-auth/commit/36ef808c6cedec6eeb9a3a4e6790e0ab46d96ff3) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: incorrect email casing across one-tap, email-otp & email-verification

- [#9239](https://github.com/better-auth/better-auth/pull/9239) [`c1336c5`](https://github.com/better-auth/better-auth/commit/c1336c563d45f93ca3fd4da4e6c767fc267d86d0) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix `organization.setActiveTeam` so it only accepts teams from the current active organization.

- [#7764](https://github.com/better-auth/better-auth/pull/7764) [`3a9a2c3`](https://github.com/better-auth/better-auth/commit/3a9a2c37eeab1d0c98845a47642d4dc27fe54ceb) Thanks [@programming-with-ia](https://github.com/programming-with-ia)! - chore: expose refreshUserSessions on internal adapter

- [#9521](https://github.com/better-auth/better-auth/pull/9521) [`fde0432`](https://github.com/better-auth/better-auth/commit/fde043207ef3d5a5e1f74aa5ddabf77d523d52d4) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: improve link accessibility issues

- Updated dependencies [[`2220a6d`](https://github.com/better-auth/better-auth/commit/2220a6d6c25ebd24c8568131636389dc0c12f82b)]:
  - @better-auth/core@1.6.10
  - @better-auth/drizzle-adapter@1.6.10
  - @better-auth/kysely-adapter@1.6.10
  - @better-auth/memory-adapter@1.6.10
  - @better-auth/mongo-adapter@1.6.10
  - @better-auth/prisma-adapter@1.6.10
  - @better-auth/telemetry@1.6.10

## 1.6.9

### Patch Changes

- Updated dependencies [[`815ecf6`](https://github.com/better-auth/better-auth/commit/815ecf62b6f6c5bf656ab55da393ce63d7eed0a6)]:
  - @better-auth/core@1.6.9
  - @better-auth/drizzle-adapter@1.6.9
  - @better-auth/kysely-adapter@1.6.9
  - @better-auth/memory-adapter@1.6.9
  - @better-auth/mongo-adapter@1.6.9
  - @better-auth/prisma-adapter@1.6.9
  - @better-auth/telemetry@1.6.9

## 1.6.8

### Patch Changes

- [#9253](https://github.com/better-auth/better-auth/pull/9253) [`856ab24`](https://github.com/better-auth/better-auth/commit/856ab2426c0dce7377ee1ca26dbb7d9e52fb6429) Thanks [@baptisteArno](https://github.com/baptisteArno)! - fix(organization): allow passing id through `beforeCreateTeam` and `beforeCreateInvitation`

  Mirrors [#4765](https://github.com/better-auth/better-auth/issues/4765) for teams and invitations: `adapter.createTeam` and `adapter.createInvitation` now pass `forceAllowId: true`, so ids returned from the respective hooks survive the DB insert.

- [#9331](https://github.com/better-auth/better-auth/pull/9331) [`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth): support `mapProfileToUser` fallback for providers that may omit email

  Social sign-in with OAuth providers that may return no email address (Discord phone-only accounts, Apple subsequent sign-ins, GitHub private emails, Facebook, LinkedIn, and Microsoft Entra ID managed users) can now be unblocked by synthesizing an email inside `mapProfileToUser`. Rejection logger messages now point at this workaround and at the new ["Handling Providers Without Email"](https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email) docs section.

  Provider profile types now reflect where `email` can be `null` or absent:
  - `DiscordProfile.email` is `string | null` and optional (absent when the `email` scope is not granted)
  - `AppleProfile.email` is optional
  - `GithubProfile.email` is `string | null`
  - `FacebookProfile.email` is optional
  - `FacebookProfile.email_verified` is optional (Meta's Graph API does not include this field)
  - `LinkedInProfile.email` is optional
  - `LinkedInProfile.email_verified` is optional
  - `MicrosoftEntraIDProfile.email` is optional

  TypeScript consumers who previously dereferenced `profile.email` directly inside `mapProfileToUser` will see a compile error that matches the runtime reality; use a nullish-coalescing fallback (`profile.email ?? ...`) or null-check the field.

  Sign-in still rejects with `error=email_not_found` (social callback) or `error=email_is_missing` (Generic OAuth plugin) when neither the provider nor `mapProfileToUser` produces an email. First-class support for users without an email, keyed on `(providerId, accountId)` per OpenID Connect Core §5.7, is tracked in [#9124](https://github.com/better-auth/better-auth/issues/9124).

- Updated dependencies [[`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3)]:
  - @better-auth/core@1.6.8
  - @better-auth/drizzle-adapter@1.6.8
  - @better-auth/kysely-adapter@1.6.8
  - @better-auth/memory-adapter@1.6.8
  - @better-auth/mongo-adapter@1.6.8
  - @better-auth/prisma-adapter@1.6.8
  - @better-auth/telemetry@1.6.8

## 1.6.7

### Patch Changes

- [#9211](https://github.com/better-auth/better-auth/pull/9211) [`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162) Thanks [@stewartjarod](https://github.com/stewartjarod)! - Preserve `Set-Cookie` headers accumulated on `ctx.responseHeaders` when an endpoint throws `APIError`. Cookie side-effects from `deleteSessionCookie` (and any `ctx.setCookie` / `ctx.setHeader` calls before the throw) are no longer silently discarded on the error path.

- [#9292](https://github.com/better-auth/better-auth/pull/9292) [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Accept an array of Client IDs on providers that verify ID tokens by audience (Google, Apple, Microsoft Entra, Facebook, Cognito). The first entry is used for the authorization code flow; all entries are accepted when verifying an ID token's `aud` claim, so a single backend can serve Web, iOS, and Android clients with their platform-specific Client IDs.

  ```ts
  socialProviders: {
    google: {
      clientId: [
        process.env.GOOGLE_WEB_CLIENT_ID!,
        process.env.GOOGLE_IOS_CLIENT_ID!,
        process.env.GOOGLE_ANDROID_CLIENT_ID!,
      ],
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  }
  ```

  Passing a single string keeps working; no migration needed.

  Also exports `getPrimaryClientId` from `@better-auth/core/oauth2` for provider authors: it returns the primary Client ID (the raw string, or the entry at array index 0), paired with `clientSecret` for the authorization code flow. Providers now reject empty arrays, empty strings, and missing config at sign-in time instead of silently producing a malformed authorization URL. Google, Apple, and Facebook require both `clientId` and `clientSecret` because each of those providers mandates a client secret for their server-side code exchange. Microsoft Entra and Cognito only require `clientId`, since both support public-client flows with PKCE alone (no secret).

- [#9293](https://github.com/better-auth/better-auth/pull/9293) [`e1b1cfc`](https://github.com/better-auth/better-auth/commit/e1b1cfc7a262c8bf0c383a7b2b1d140472d33e56) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Guard against `c.body` being undefined in `parseState`. Callback requests that arrive as GET leave `c.body` unset in some runtimes, which caused `c.body.state` to throw a `TypeError` before the existing error redirect could run. The state lookup now short-circuits on the query parameter and falls back to `c.body?.state` safely, so a callback without a state parameter redirects to the error page instead of crashing.

- [#4894](https://github.com/better-auth/better-auth/pull/4894) [`d053a45`](https://github.com/better-auth/better-auth/commit/d053a4583e0db9132e52a100ae33e13d040a6bae) Thanks [@Kinfe123](https://github.com/Kinfe123)! - Fire `callbackOnVerification` when a phone number is verified with `updatePhoneNumber: true`. The callback previously only ran on initial verification, so consumers relying on it (e.g. to sync verified numbers to an external system) would miss the event when an authenticated user changed their number.

- Updated dependencies [[`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162), [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5), [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb)]:
  - @better-auth/core@1.6.7
  - @better-auth/drizzle-adapter@1.6.7
  - @better-auth/kysely-adapter@1.6.7
  - @better-auth/memory-adapter@1.6.7
  - @better-auth/mongo-adapter@1.6.7
  - @better-auth/prisma-adapter@1.6.7
  - @better-auth/telemetry@1.6.7

## 1.6.6

### Patch Changes

- [#9214](https://github.com/better-auth/better-auth/pull/9214) [`4debfb6`](https://github.com/better-auth/better-auth/commit/4debfb600ff448f3e63ed242a2fb5a2c41654be1) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(custom-session): use coerced boolean for disableRefresh query param validation

- [#9235](https://github.com/better-auth/better-auth/pull/9235) [`9ea7eb1`](https://github.com/better-auth/better-auth/commit/9ea7eb1eab28d50d40836ab4e2cbe5a81c4da1aa) Thanks [@bytaesu](https://github.com/bytaesu)! - Preserve the `Partitioned` attribute when the `customSession` plugin and framework integrations forward `Set-Cookie` headers.

- [#9266](https://github.com/better-auth/better-auth/pull/9266) [`ab4c10f`](https://github.com/better-auth/better-auth/commit/ab4c10fbc09defcd851d614acecc111cc114b543) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(organization): infer team additional fields correctly

- [#9219](https://github.com/better-auth/better-auth/pull/9219) [`a61083e`](https://github.com/better-auth/better-auth/commit/a61083e023163d0a14d9e886ce556ba459677428) Thanks [@bytaesu](https://github.com/bytaesu)! - Allow removing a phone number with `updateUser({ phoneNumber: null })`. The verified flag is reset atomically. Changing to a different number still requires OTP verification through `verify({ updatePhoneNumber: true })`.

- [#9226](https://github.com/better-auth/better-auth/pull/9226) [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Consolidate host/IP classification behind `@better-auth/core/utils/host` and close several loopback/SSRF bypasses that the previous per-package regex checks missed.

  **Electron user-image proxy: SSRF bypasses closed (`@better-auth/electron`).** `fetchUserImage` previously gated outbound requests with a bespoke IPv4/IPv6 regex that missed multiple vectors. All of the following were reachable in production and are now blocked:
  - `http://tenant.localhost/` and other `*.localhost` names (RFC 6761 reserves the entire TLD for loopback).
  - `http://[::ffff:169.254.169.254]/` (IPv4-mapped IPv6 to AWS IMDS, the classic SSRF bypass).
  - `http://metadata.google.internal/`, `http://metadata.goog/` (GCP instance metadata).
  - `http://instance-data/`, `http://instance-data.ec2.internal/` (AWS IMDS alternate FQDNs).
  - `http://100.100.100.200/` (Alibaba Cloud IMDS; lives in RFC 6598 shared address space `100.64/10`, which the old regex did not cover).
  - `http://0.0.0.0:PORT/` (the Linux/macOS kernel routes the unspecified address to loopback: Oligo's "0.0.0.0 Day").
  - `http://[fc00::...]/`, `http://[fd00::...]/` (IPv6 ULA per RFC 4193) and IPv6 link-local `fe80::/10`, neither of which the regex recognized.

  Documentation ranges (RFC 5737 / RFC 3849), benchmarking (`198.18/15`), multicast, and broadcast are also now rejected.

  **`better-auth`: `0.0.0.0` is no longer treated as loopback.** The previous `isLoopbackHost` implementation in `packages/better-auth/src/utils/url.ts` classified `0.0.0.0` alongside `127.0.0.1` / `::1` / `localhost`. `0.0.0.0` is the unspecified address, not loopback; treating it as such lets browser-origin requests reach localhost-bound dev services (Oligo's "0.0.0.0 Day"). The helper now accepts the full `127.0.0.0/8` range and any `*.localhost` name, and rejects `0.0.0.0`.

  **`better-auth`: trusted-origin substring hardening.** `getTrustedOrigins` previously used `host.includes("localhost") || host.includes("127.0.0.1")` when deciding whether to add an `http://` variant for a dynamic `baseURL.allowedHosts` entry. Misconfigurations like `evil-localhost.com` or `127.0.0.1.nip.io` would incorrectly gain an HTTP origin in the trust list. The check now uses the shared classifier, so only real loopback hosts get the HTTP variant.

  **`@better-auth/oauth-provider`: RFC 8252 compliance.**
  - §7.3 redirect URI matching now accepts the full `127.0.0.0/8` range (not just `127.0.0.1`) plus `[::1]`, with port-flexible comparison. Port-flexible matching is limited to IP literals; DNS names such as `localhost` continue to use exact-string matching per §8.3 ("NOT RECOMMENDED" for loopback).
  - `validateIssuerUrl` uses the shared loopback check rather than a two-hostname literal comparison.

  **New module: `@better-auth/core/utils/host`.** Exposes `classifyHost`, `isLoopbackIP`, `isLoopbackHost`, and `isPublicRoutableHost`. One RFC 6890 / RFC 6761 / RFC 8252 implementation that handles IPv4, IPv6 (including bracketed literals, zone IDs, IPv4-mapped addresses, and 6to4 / NAT64 / Teredo tunnel forms with embedded-IPv4 recursion), and FQDNs, with a curated cloud-metadata FQDN set. All bespoke loopback/private/link-local checks across the monorepo now route through it.

- Updated dependencies [[`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7), [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b), [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da)]:
  - @better-auth/core@1.6.6
  - @better-auth/drizzle-adapter@1.6.6
  - @better-auth/kysely-adapter@1.6.6
  - @better-auth/memory-adapter@1.6.6
  - @better-auth/mongo-adapter@1.6.6
  - @better-auth/prisma-adapter@1.6.6
  - @better-auth/telemetry@1.6.6

## 1.6.5

### Patch Changes

- [#9119](https://github.com/better-auth/better-auth/pull/9119) [`938dd80`](https://github.com/better-auth/better-auth/commit/938dd80e2debfab7f7ef480792a5e63876e779d9) Thanks [@GautamBytes](https://github.com/GautamBytes)! - clarify recommended production usage for the test utils plugin

- [#9087](https://github.com/better-auth/better-auth/pull/9087) [`0538627`](https://github.com/better-auth/better-auth/commit/05386271ca143d07416297611d3b31e6c20e2f2a) Thanks [@ramonclaudio](https://github.com/ramonclaudio)! - fix(client): refetch session after `/change-password` and `/revoke-other-sessions`

- Updated dependencies []:
  - @better-auth/core@1.6.5
  - @better-auth/drizzle-adapter@1.6.5
  - @better-auth/kysely-adapter@1.6.5
  - @better-auth/memory-adapter@1.6.5
  - @better-auth/mongo-adapter@1.6.5
  - @better-auth/prisma-adapter@1.6.5
  - @better-auth/telemetry@1.6.5

## 1.6.4

### Patch Changes

- [#9205](https://github.com/better-auth/better-auth/pull/9205) [`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(two-factor): revert enforcement broadening from [#9122](https://github.com/better-auth/better-auth/issues/9122)

  Restores the pre-[#9122](https://github.com/better-auth/better-auth/issues/9122) enforcement scope. 2FA is challenged only on `/sign-in/email`, `/sign-in/username`, and `/sign-in/phone-number`, matching the behavior that shipped through v1.6.2. Non-credential sign-in flows (magic link, email OTP, OAuth, SSO, passkey, SIWE, one-tap, phone-number OTP, device authorization, email-verification auto-sign-in) are no longer gated by a 2FA challenge by default.

  A broader enforcement scope with per-method opt-outs and alignment to NIST SP 800-63B-4 authenticator assurance levels is planned for a future minor release.

- [#9068](https://github.com/better-auth/better-auth/pull/9068) [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix forced UUID user IDs from create hooks being ignored on PostgreSQL adapters when `advanced.database.generateId` is set to `"uuid"`.

- [#9165](https://github.com/better-auth/better-auth/pull/9165) [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - chore(adapters): require patched `drizzle-orm` and `kysely` peer versions

  Narrows the `drizzle-orm` peer to `^0.45.2` and the `kysely` peer to `^0.28.14`. Both new ranges track the minor line that carries the vulnerability fix and nothing newer, so the adapters only advertise support for versions that have actually been tested against. Consumers on older ORM releases see an install-time warning and can upgrade alongside the adapter; the peer is marked optional, so installs do not hard-fail.

- Updated dependencies [[`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - @better-auth/drizzle-adapter@1.6.4
  - @better-auth/kysely-adapter@1.6.4
  - @better-auth/core@1.6.4
  - @better-auth/memory-adapter@1.6.4
  - @better-auth/mongo-adapter@1.6.4
  - @better-auth/prisma-adapter@1.6.4
  - @better-auth/telemetry@1.6.4

## 1.6.3

### Patch Changes

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

- [#9122](https://github.com/better-auth/better-auth/pull/9122) [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(two-factor): enforce 2FA on all sign-in paths

  The 2FA after-hook now triggers on any endpoint that creates a new session, covering magic-link, OAuth, passkey, email-OTP, SIWE, and all future sign-in methods. Authenticated requests (session refreshes, profile updates) are excluded.

- [#7231](https://github.com/better-auth/better-auth/pull/7231) [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f) Thanks [@Byte-Biscuit](https://github.com/Byte-Biscuit)! - fix(two-factor): preserve backup codes storage format after verification

  After using a backup code, remaining codes are now re-saved using the same `storeBackupCodes` strategy (plain, encrypted, or custom) configured by the user. Previously, codes were always re-encrypted with the built-in symmetric encryption, breaking subsequent verifications for plain or custom storage modes.

- [#9072](https://github.com/better-auth/better-auth/pull/9072) [`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d) Thanks [@ramonclaudio](https://github.com/ramonclaudio)! - fix(api): align top-level `operationId` on `requestPasswordResetCallback` with the OpenAPI `resetPasswordCallback`

- [#8389](https://github.com/better-auth/better-auth/pull/8389) [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649) Thanks [@Oluwatobi-Mustapha](https://github.com/Oluwatobi-Mustapha)! - fix(open-api): correct get-session nullable schema for OAS 3.1

- [#9078](https://github.com/better-auth/better-auth/pull/9078) [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(client): prevent isMounted race condition causing many rps

- [#9113](https://github.com/better-auth/better-auth/pull/9113) [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af) Thanks [@bytaesu](https://github.com/bytaesu)! - resolve dynamic `baseURL` from request headers on direct `auth.api` calls

- [#8926](https://github.com/better-auth/better-auth/pull/8926) [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463) Thanks [@bytaesu](https://github.com/bytaesu)! - omit quantity for metered prices in checkout and upgrades

- [#9084](https://github.com/better-auth/better-auth/pull/9084) [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f) Thanks [@bytaesu](https://github.com/bytaesu)! - support Stripe SDK v21 and v22

- Updated dependencies [[`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656)]:
  - @better-auth/core@1.7.0-beta.0
  - @better-auth/drizzle-adapter@1.7.0-beta.0
  - @better-auth/kysely-adapter@1.7.0-beta.0
  - @better-auth/memory-adapter@1.7.0-beta.0
  - @better-auth/mongo-adapter@1.7.0-beta.0
  - @better-auth/prisma-adapter@1.7.0-beta.0
  - @better-auth/telemetry@1.7.0-beta.0
- Updated dependencies []:
  - @better-auth/core@1.6.3
  - @better-auth/drizzle-adapter@1.6.3
  - @better-auth/kysely-adapter@1.6.3
  - @better-auth/memory-adapter@1.6.3
  - @better-auth/mongo-adapter@1.6.3
  - @better-auth/prisma-adapter@1.6.3
  - @better-auth/telemetry@1.6.3

## 1.6.2

### Patch Changes

- [#8949](https://github.com/better-auth/better-auth/pull/8949) [`9deb793`](https://github.com/better-auth/better-auth/commit/9deb7936aba7931f2db4b460141f476508f11bfd) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - security: verify OAuth state parameter against cookie-stored nonce to prevent CSRF on cookie-backed flows

- [#8983](https://github.com/better-auth/better-auth/pull/8983) [`2cbcb9b`](https://github.com/better-auth/better-auth/commit/2cbcb9baacdd8e6fa1ed605e9b788f8922f0a8c2) Thanks [@jaydeep-pipaliya](https://github.com/jaydeep-pipaliya)! - fix(oauth2): prevent cross-provider account collision in link-social callback

  The link-social callback used `findAccount(accountId)` which matched by account ID across all providers. When two providers return the same numeric ID (e.g. both Google and GitHub assign `99999`), the lookup could match the wrong provider's account, causing a spurious `account_already_linked_to_different_user` error or silently updating the wrong account's tokens.

  Replaced with `findAccountByProviderId(accountId, providerId)` to scope the lookup to the correct provider, matching the pattern already used in the generic OAuth plugin.

- [#9059](https://github.com/better-auth/better-auth/pull/9059) [`b20fa42`](https://github.com/better-auth/better-auth/commit/b20fa424c379396f0b86f94fbac1604e4a17fe19) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(next-js): replace cookie probe with header-based RSC detection in `nextCookies()` to prevent infinite router refresh loops and eliminate leaked `__better-auth-cookie-store` cookie. Also fix two-factor enrollment flows to set the new session cookie before deleting the old session.

- [#9058](https://github.com/better-auth/better-auth/pull/9058) [`608d8c3`](https://github.com/better-auth/better-auth/commit/608d8c3082c2d6e52c6ca6a8f38348619869b1ae) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(sso): include RelayState in signed SAML AuthnRequests per SAML 2.0 Bindings §3.4.4.1
  - RelayState is now passed to samlify's ServiceProvider constructor so it is included in the redirect binding signature. Previously it was appended after the signature, causing spec-compliant IdPs to reject signed AuthnRequests.
  - `authnRequestsSigned: true` without a private key now throws instead of silently sending unsigned requests.

- [#8772](https://github.com/better-auth/better-auth/pull/8772) [`8409843`](https://github.com/better-auth/better-auth/commit/84098432ad8432fe33b3134d933e574259f3430a) Thanks [@aarmful](https://github.com/aarmful)! - feat(two-factor): include enabled 2fa methods in sign-in redirect response

  The 2FA sign-in redirect now returns `twoFactorMethods` (e.g. `["totp", "otp"]`) so frontends can render the correct verification UI without guessing. The `onTwoFactorRedirect` client callback receives `twoFactorMethods` as a context parameter.
  - TOTP is included only when the user has a verified TOTP secret and TOTP is not disabled in config.
  - OTP is included when `otpOptions.sendOTP` is configured.
  - Unverified TOTP enrollments are excluded from the methods list.

- [#8711](https://github.com/better-auth/better-auth/pull/8711) [`e78a7b1`](https://github.com/better-auth/better-auth/commit/e78a7b120d56b7320cc8d818270e20057963a7b2) Thanks [@aarmful](https://github.com/aarmful)! - fix(two-factor): prevent unverified TOTP enrollment from gating sign-in

  Adds a `verified` boolean column to the `twoFactor` table that tracks whether a TOTP secret has been confirmed by the user.
  - **First-time enrollment:** `enableTwoFactor` creates the row with `verified: false`. The row is promoted to `verified: true` only after `verifyTOTP` succeeds with a valid code.
  - **Re-enrollment** (calling `enableTwoFactor` when TOTP is already verified): the new row preserves `verified: true`, so the user is never locked out of sign-in while rotating their TOTP secret.
  - **Sign-in:** `verifyTOTP` rejects rows where `verified === false`, preventing abandoned enrollments from blocking authentication. Backup codes and OTP are unaffected and work as fallbacks during unfinished enrollment.

  **Migration:** The new column defaults to `true`, so existing `twoFactor` rows are treated as verified. No data migration is required. `skipVerificationOnEnable: true` is also unaffected — the row is created as `verified: true` in that mode.

- Updated dependencies []:
  - @better-auth/core@1.6.2
  - @better-auth/drizzle-adapter@1.6.2
  - @better-auth/kysely-adapter@1.6.2
  - @better-auth/memory-adapter@1.6.2
  - @better-auth/mongo-adapter@1.6.2
  - @better-auth/prisma-adapter@1.6.2
  - @better-auth/telemetry@1.6.2

## 1.6.1

### Patch Changes

- [#9023](https://github.com/better-auth/better-auth/pull/9023) [`2e537df`](https://github.com/better-auth/better-auth/commit/2e537df5f7f2a4263f52cce74d7a64a0a947792b) Thanks [@jonathansamines](https://github.com/jonathansamines)! - Update endpoint instrumentation to always use endpoint routes

- [#8902](https://github.com/better-auth/better-auth/pull/8902) [`f61ad1c`](https://github.com/better-auth/better-auth/commit/f61ad1cab7360e4460e6450904e97498298a79d5) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - use `INVALID_PASSWORD` for all `checkPassword` failures

- [#9017](https://github.com/better-auth/better-auth/pull/9017) [`7495830`](https://github.com/better-auth/better-auth/commit/749583065958e8a310badaa5ea3acc8382dc0ca2) Thanks [@bytaesu](https://github.com/bytaesu)! - restore getSession accessibility in generic Auth<O> context

- Updated dependencies []:
  - @better-auth/core@1.6.1
  - @better-auth/drizzle-adapter@1.6.1
  - @better-auth/kysely-adapter@1.6.1
  - @better-auth/memory-adapter@1.6.1
  - @better-auth/mongo-adapter@1.6.1
  - @better-auth/prisma-adapter@1.6.1
  - @better-auth/telemetry@1.6.1

## 1.6.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add case-insensitive query support for database adapters

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [#8985](https://github.com/better-auth/better-auth/pull/8985) [`dd537cb`](https://github.com/better-auth/better-auth/commit/dd537cbdeb618abe9e274129f1670d0c03e89ae5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - deprecate `oidc-provider` plugin in favor of `@better-auth/oauth-provider`

  The `oidc-provider` plugin now emits a one-time runtime deprecation warning when instantiated and is marked as `@deprecated` in TypeScript. It will be removed in the next major version. Migrate to `@better-auth/oauth-provider`.

- [#8843](https://github.com/better-auth/better-auth/pull/8843) [`bd9bd58`](https://github.com/better-auth/better-auth/commit/bd9bd58f8768b2512f211c98c227148769d533c5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - enforce role-based authorization on SCIM management endpoints and normalize passkey ownership checks via shared authorization middleware

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Return additional user fields and session data from the magic-link verify endpoint

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Allow passwordless users to enable, disable, and manage two-factor authentication

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Prevent updateUser from overwriting unrelated username or displayUsername fields

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Use non-blocking scrypt for password hashing to avoid blocking the event loop

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enforce username uniqueness when updating a user profile

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Align session fresh age calculation with creation time instead of update time

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Compare account cookie by provider accountId instead of internal id

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Trigger session signal after requesting email change in email-otp plugin

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Rethrow sendOTP failures in phone-number plugin instead of silently swallowing them

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Read OAuth proxy callback parameters from request body when using form_post response mode

- [#8980](https://github.com/better-auth/better-auth/pull/8980) [`469eee6`](https://github.com/better-auth/better-auth/commit/469eee6d846b32a43f36b418868e6a4c916382dc) Thanks [@bytaesu](https://github.com/bytaesu)! - fix oauth state double-hashing when verification storeIdentifier is set to hashed

- [#8981](https://github.com/better-auth/better-auth/pull/8981) [`560230f`](https://github.com/better-auth/better-auth/commit/560230f751dfc5d6efc8f7f3f12e5970c9ba09ea) Thanks [@bytaesu](https://github.com/bytaesu)! - Prevent `any` from collapsing `auth.$Infer` and `auth.$ERROR_CODES`. Preserve client query typing when body is `any`.

- Updated dependencies [[`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33)]:
  - @better-auth/drizzle-adapter@1.6.0
  - @better-auth/kysely-adapter@1.6.0
  - @better-auth/memory-adapter@1.6.0
  - @better-auth/mongo-adapter@1.6.0
  - @better-auth/prisma-adapter@1.6.0
  - @better-auth/core@1.6.0
  - @better-auth/telemetry@1.6.0

## 1.6.0-beta.0

### Minor Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add case-insensitive query support for database adapters

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Return additional user fields and session data from the magic-link verify endpoint

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Allow passwordless users to enable, disable, and manage two-factor authentication

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Prevent updateUser from overwriting unrelated username or displayUsername fields

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Use non-blocking scrypt for password hashing to avoid blocking the event loop

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enforce username uniqueness when updating a user profile

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Align session fresh age calculation with creation time instead of update time

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Compare account cookie by provider accountId instead of internal id

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Trigger session signal after requesting email change in email-otp plugin

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Rethrow sendOTP failures in phone-number plugin instead of silently swallowing them

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Read OAuth proxy callback parameters from request body when using form_post response mode

- Updated dependencies [[`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b)]:
  - @better-auth/drizzle-adapter@1.6.0-beta.0
  - @better-auth/kysely-adapter@1.6.0-beta.0
  - @better-auth/memory-adapter@1.6.0-beta.0
  - @better-auth/mongo-adapter@1.6.0-beta.0
  - @better-auth/prisma-adapter@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
  - @better-auth/telemetry@1.6.0-beta.0
