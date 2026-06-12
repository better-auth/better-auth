# @better-auth/oauth-provider

## 1.7.0-beta.5

### Minor Changes

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

- [#9936](https://github.com/better-auth/better-auth/pull/9936) [`0e1770a`](https://github.com/better-auth/better-auth/commit/0e1770ac7563a27b1daab96d5d571657b3a45f75) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `max_age` is now enforced. When a client requests `max_age` and the user authenticated longer ago than that window, the provider sends them back to log in, and the resulting ID token's `auth_time` reflects the fresh login. Previously `max_age` was accepted but ignored, so flows that relied on it being a no-op will now prompt the user to log in again.

- [#9970](https://github.com/better-auth/better-auth/pull/9970) [`3e852a2`](https://github.com/better-auth/better-auth/commit/3e852a26500446b2c4ad608933c71b616ceddba5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Revoking a JWT access token that still verifies for this server now returns `400 unsupported_token_type` at `/oauth2/revoke` instead of a misleading `200`. A JWT is self-contained and is never stored, so the server cannot revoke it; the previous success response implied otherwise while the token kept working until expiry. An already-expired or wrong-audience JWT fails verification and still returns a successful `200` no-op.

  To cut off access for a JWT access token, end the session (sign-out, admin revoke, or back-channel logout), which marks `sid`-bound tokens inactive at introspection and userinfo, or rely on a short token lifetime. Opaque and refresh token revocation are unchanged.

### Patch Changes

- [#9930](https://github.com/better-auth/better-auth/pull/9930) [`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Anonymous account linking now works after social and generic OAuth sign-in in Expo and other in-app browsers, where the OAuth callback returns without the session cookie. `onLinkAccount` fires and the anonymous user is migrated; before, it was silently skipped.

  Plugins can now carry server-trusted data across an OAuth redirect with the new `addOAuthServerContext` API, read back on the callback via `getOAuthState().serverContext`. Unlike `additionalData`, it cannot be set from the request body, so it is the right place for values the server must trust.

  For `@better-auth/oauth-provider`, the post-login authorization query now travels through that server-only channel, so it can no longer be injected through `additionalData`.

- Updated dependencies [[`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5), [`e014029`](https://github.com/better-auth/better-auth/commit/e0140297a59ddb59cccbcb4ba46c513de8cb86a7), [`ec8a38c`](https://github.com/better-auth/better-auth/commit/ec8a38c08f5cfe2d922be0f8a49f2d0fa84de799), [`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2), [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f), [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f), [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b), [`76a3342`](https://github.com/better-auth/better-auth/commit/76a33429fc2a3edcc85307bf81b9d92a95f9de6c), [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f)]:
  - better-auth@1.7.0-beta.5
  - @better-auth/core@1.7.0-beta.5

## 1.7.0-beta.4

### Minor Changes

- [#9836](https://github.com/better-auth/better-auth/pull/9836) [`b4b0867`](https://github.com/better-auth/better-auth/commit/b4b086722c2da179f885ad2680e10ed3410ad849) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Bind OAuth 2.0 resource indicators (RFC 8707) to the authorization grant. The `resource` (audience) was previously read from the token request and checked only against the server-wide `validAudiences` allowlist. A client could therefore obtain an access token for any allow-listed resource, regardless of what the authorization covered. The provider now captures `resource` at `/authorize`, records it on the grant, and lets the token and refresh endpoints narrow it without widening it. Refresh tokens retain the resources of the original grant (RFC 8707 §2.2), and `/oauth2/introspect` reports the token's `aud`.

  Breaking change: when the authorization includes a `resource`, the token and refresh requests may only narrow it. A request for a resource the authorization did not cover returns `invalid_target`. The `customAccessTokenClaims` callback now receives a `resources` array in place of the `resource` string.

  Migration: run the schema migration (`npx @better-auth/cli migrate`, or `generate` if you manage the schema yourself) to add the new resource columns.

## 1.6.17

### Patch Changes

- [#9987](https://github.com/better-auth/better-auth/pull/9987) [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8) Thanks [@bytaesu](https://github.com/bytaesu)! - Token introspection and revocation no longer fetch the signing keys from the database on every request. Keys are cached per auth instance with the same five-minute refresh as remote JWKS sources.

- Updated dependencies [[`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`3e99e6c`](https://github.com/better-auth/better-auth/commit/3e99e6c77ef788377a3ddb7abe790c7dc3df1493), [`96c78c3`](https://github.com/better-auth/better-auth/commit/96c78c3e983ab3a2d914780fcc5d66d90537f9ac), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`ed7b6c9`](https://github.com/better-auth/better-auth/commit/ed7b6c9ac0fa2bb7f246f552b41046302ef8138c), [`e0a768c`](https://github.com/better-auth/better-auth/commit/e0a768c973f9d9ccd4aee959efcbe1fbcc2e608d), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`d9c526b`](https://github.com/better-auth/better-auth/commit/d9c526b2a57afe9e01ff25da400f1d634b4c1ac7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`8960f5f`](https://github.com/better-auth/better-auth/commit/8960f5f3bd2f0dccbfb768d69737d8a24d793a9e), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`5c289b5`](https://github.com/better-auth/better-auth/commit/5c289b52bc166be3a36ec3c112b04195dc7621d8), [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`59e0ccb`](https://github.com/better-auth/better-auth/commit/59e0ccbedc6c336b1e77f71c62484d654fd2fca3), [`b803c61`](https://github.com/better-auth/better-auth/commit/b803c61fdcfc64be4e26bf6fa10953621f0070cc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7)]:
  - better-auth@1.6.17
  - @better-auth/core@1.6.17

## 1.6.16

### Patch Changes

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - The `/oauth2/continue` post-login step no longer treats the client-submitted `postLogin` flag as proof that an interactive gate completed. Completion is now derived from the server-issued, session-bound marker on the signed `oauth_query` (matching the consent endpoint); when it is absent, `authorize` re-runs `postLogin.shouldRedirect` against the current session and redirects back to the gate if selection is still required.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Token introspection now requires JWT access tokens to carry an `azp` (client) claim and resolve to an enabled client before being reported as active. This ensures only tokens issued by the OAuth token endpoint are treated as access tokens, since the JWT plugin can mint session JWTs that share the same issuer, audience, and signing keys.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Enforce per-client grant types at the token endpoint. Previously only the provider-wide `grantTypes` allowlist was checked, so a client registered for `authorization_code` could still request `client_credentials` tokens, turning a user-delegated client into a machine-to-machine client. The `client_credentials` and `authorization_code` grants are now rejected with `unauthorized_client` unless the client declares them. Refresh tokens remain available to any client permitted the `authorization_code` grant (gated by `offline_access`), but are no longer issued to pure `client_credentials` clients. Clients with no recorded `grantTypes` fall back to `["authorization_code"]`, matching the registration default.

- Updated dependencies [[`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`87e7aa5`](https://github.com/better-auth/better-auth/commit/87e7aa5e0fd8f19b326beb5bec409a9ed1f245ca), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`893cf6c`](https://github.com/better-auth/better-auth/commit/893cf6cb3f1f2669b39f6ac8d3d49cf830e5732e), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`5e49c56`](https://github.com/better-auth/better-auth/commit/5e49c56a9e12a9b6b3fd1202bbc7a2fc97aeeafd), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15)]:
  - better-auth@1.6.16
  - @better-auth/core@1.6.16

## 1.6.15

### Patch Changes

- [#9919](https://github.com/better-auth/better-auth/pull/9919) [`b0ddfd3`](https://github.com/better-auth/better-auth/commit/b0ddfd3433cafac312ee99ec5fb7dbb9a240da35) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Run configured hooks through the whole OAuth sign-in flow

  `hooks.before` / `hooks.after` configured on the auth instance now run for the OAuth authorization that continues after a user signs in, selects an account, or consents. They were being skipped there.

  Headers or cookies a `hooks.before` sets before returning its own response are no longer dropped, and a `hooks.after` that throws an `APIError` no longer loses either its cookies or the error's headers.

- [#9937](https://github.com/better-auth/better-auth/pull/9937) [`fe9600b`](https://github.com/better-auth/better-auth/commit/fe9600bc0734eeb2e6fbb0c53d3b81888bd4247d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The UserInfo endpoint (`/oauth2/userinfo`) now accepts `POST` with the access token in the `Authorization` header, in addition to `GET`.

- Updated dependencies [[`1012b69`](https://github.com/better-auth/better-auth/commit/1012b690466ccd7078441dbfb406eef166fca805), [`ad60333`](https://github.com/better-auth/better-auth/commit/ad60333d1517142d688c61b6ccee14b4c30864ae), [`0933c05`](https://github.com/better-auth/better-auth/commit/0933c050ff8735466a273347c9aab0fdd8cd38ff), [`b0ddfd3`](https://github.com/better-auth/better-auth/commit/b0ddfd3433cafac312ee99ec5fb7dbb9a240da35)]:
  - better-auth@1.6.15
  - @better-auth/core@1.6.15

## 1.6.14

### Patch Changes

- [#9845](https://github.com/better-auth/better-auth/pull/9845) [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

- Updated dependencies [[`2d9781a`](https://github.com/better-auth/better-auth/commit/2d9781a83ddc7b51ecffbd7d24c28e4b917e2323), [`5a2d642`](https://github.com/better-auth/better-auth/commit/5a2d642bc7d940f4242df9b304818a8653ea2a10), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f), [`9d3450a`](https://github.com/better-auth/better-auth/commit/9d3450ae23e8387d24adfb7bb1cb24cc6965b6e3)]:
  - better-auth@1.6.14
  - @better-auth/core@1.6.14

## 1.6.13

### Patch Changes

- [#9657](https://github.com/better-auth/better-auth/pull/9657) [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden `private_key_jwt` and token endpoint client authentication, and add the helpers that make the fix structural.

  `@better-auth/core/oauth2` now exposes `encodeBasicCredentials` and `decodeBasicCredentials`, a round-trip-tested pair that follows RFC 6749 §2.3.1 (`application/x-www-form-urlencoded` each value, split on the first `:` only). The decoder accepts the scheme case-insensitively and tolerates one or more spaces before the credentials per RFC 7235 §2.1. `client_secret_basic` on the client side and the Better Auth OAuth provider on the server side both go through these helpers, so credentials containing reserved characters round-trip cleanly across the stack and headers like `basic xxx` or `Basic  xxx` are accepted.

  `createPrivateKeyJwtClientAssertionGetter` validates options eagerly. Unsupported algorithms (`HS256`, `none`), a JWK with no key material, and disagreement between an explicit `algorithm` and the JWK-embedded `alg` all throw at construction rather than on the first token request. `signPrivateKeyJwtClientAssertion` enforces the same checks for direct callers. **Breaking:** configurations that paired an unsupported JWK `alg` with a different explicit `algorithm` used to silently sign with the explicit option; they now fail at construction.

  `@better-auth/oauth-provider` rejects empty `jwks` payloads at the schema layer (`jwks: []` and `jwks: { keys: [] }`) so the documented client metadata contract matches what `checkOAuthClient` already enforces at runtime. Schema consumers (TypeScript, OpenAPI, generated SDKs) now see the constraint.

  The SSO `private_key_jwt` flow redirects with `error_description=no_private_key_available` when a `resolvePrivateKey` callback returns no `privateKeyJwk` or `privateKeyPem`. The redirect path previously short-circuited only when the resolver was absent entirely; an empty resolver return fell through into an internal signing error.

  `better-auth/test` adds `getHttpTestInstance`, a counterpart to `getTestInstance` that binds a real HTTP listener on an OS-assigned port and constructs the auth instance against the discovered URL. It removes the temp-server-then-rebind race that test files have been individually copy-pasting.

- [#9845](https://github.com/better-auth/better-auth/pull/9845) [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

- Updated dependencies [[`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8), [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - better-auth@1.7.0-beta.4
  - @better-auth/core@1.7.0-beta.4

## 1.7.0-beta.3

### Patch Changes

- Updated dependencies [[`4e8e4c7`](https://github.com/better-auth/better-auth/commit/4e8e4c7fc5fb2723144cbf41c4a1bfa28de8d671), [`523f95c`](https://github.com/better-auth/better-auth/commit/523f95c10db24b790bbd75fe85c86c34d3465267), [`729c00d`](https://github.com/better-auth/better-auth/commit/729c00d74c94f558893da1e3a9ee86451d1b23da)]:
  - better-auth@1.7.0-beta.3
  - @better-auth/core@1.7.0-beta.3

## 1.7.0-beta.2

### Minor Changes

- [#9277](https://github.com/better-auth/better-auth/pull/9277) [`5c6de4e`](https://github.com/better-auth/better-auth/commit/5c6de4ed265e7aa30e7e42a0e493386cf3ad6c96) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): return RFC-compliant `{ error, error_description }` envelopes from validation failures

  An internal `createOAuthEndpoint` wrapper now translates zod validation failures into the envelope required by RFC 6749 §5.2, 7009 §2.2.1, 7662 §2.3, and 7591 §3.2.2. Failing issues are routed per field:
  - an absent required value maps to `errorCodesByField[name].missing` or the endpoint's `defaultError`.
  - an unsupported value (unknown enum member) maps to `errorCodesByField[name].invalid` or `defaultError`.
  - any other failure (wrong type, duplicated query params, invalid format, refinement) maps to `defaultError`, so RFC 6749 §3.1 malformed requests emit the endpoint's default code regardless of field.

  All six OAuth endpoints (`/oauth2/token`, `/oauth2/authorize`, `/oauth2/revoke`, `/oauth2/introspect`, `/oauth2/register`, `/oauth2/end-session`) now return RFC-compliant errors for malformed requests. `/oauth2/authorize` validation failures redirect to the relying party with `error`, `error_description`, echoed `state`, and `iss` whenever `client_id` and `redirect_uri` resolve against the registered client; requests without a trusted RP fall back to the server error page.

  Additional RFC compliance fixes on the same endpoints:
  - `/oauth2/revoke` and `/oauth2/introspect` now ignore an unknown `token_type_hint` instead of rejecting it. RFC 7009 §2.2.1 and RFC 7662 §2.1 reserve `unsupported_token_type` for the token itself, not the hint value; servers MAY ignore unrecognized hints and search across supported token types.
  - `/oauth2/authorize` error redirects now respect OIDC Core 1.0 §5 response modes. Errors for `response_type=token` or `id_token` are delivered in the URL fragment per RFC 6749 §4.2.2.1; an explicit `response_mode=query` overrides the default.

### Patch Changes

- Updated dependencies [[`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4), [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09), [`954b664`](https://github.com/better-auth/better-auth/commit/954b664f4f251f8dd028451dab3ab43067dbf890), [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - better-auth@1.7.0-beta.2
  - @better-auth/core@1.7.0-beta.2

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

- Updated dependencies [[`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45), [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f), [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f), [`c7d2253`](https://github.com/better-auth/better-auth/commit/c7d22539ec4f7322d9625ae2953d397c3863d097), [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7), [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af), [`6f2948e`](https://github.com/better-auth/better-auth/commit/6f2948e87bb5fa14bd2174a91f7143e1eced1b87)]:
  - better-auth@1.7.0-beta.1
  - @better-auth/core@1.7.0-beta.1

## 1.7.0-beta.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `private_key_jwt` (RFC 7523) client authentication across the stack. Servers verify JWT client assertions signed with asymmetric keys; clients sign them for authorization code, refresh, and client credentials flows.

### Patch Changes

- Updated dependencies [[`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d), [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649), [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463), [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f), [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656), [`544f1c6`](https://github.com/better-auth/better-auth/commit/544f1c63c9826831d96a126fbe568d8a8a8fde68)]:
  - better-auth@1.7.0-beta.0
  - @better-auth/core@1.7.0-beta.0

## 1.6.10

### Patch Changes

- [#9344](https://github.com/better-auth/better-auth/pull/9344) [`408a307`](https://github.com/better-auth/better-auth/commit/408a3076bdd5b450c96bdad82be797ac8a8d3f83) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): bind consent-accept postLogin skip to the signing session

  When `authorize` emits a signed redirect past the postLogin gate it now
  records `ba_pl=<sessionId>` in the signed authorization query. On consent
  accept, `authorizeEndpoint` is called with `{ postLogin: true }` only when
  the incoming signed query's marker matches the current session's id;
  otherwise it re-enters `authorize` with `postLogin.shouldRedirect` still
  enforced. Resolves the post-consent bounce back to the postLogin page for
  `setActive`-driven flows, blocks a direct POST to `/oauth2/consent` with
  a pre-postLogin signed query from skipping `shouldRedirect`, and prevents
  a different or newly logged-in session from re-using another session's
  marker to skip `shouldRedirect`.

- [#9389](https://github.com/better-auth/better-auth/pull/9389) [`f7bc1c7`](https://github.com/better-auth/better-auth/commit/f7bc1c73490d657a8ffa92a58ecfa9d8403d4fda) Thanks [@zllovesuki](https://github.com/zllovesuki)! - Add indexes to OAuth provider foreign-key fields in generated schemas.

- [#9344](https://github.com/better-auth/better-auth/pull/9344) [`408a307`](https://github.com/better-auth/better-auth/commit/408a3076bdd5b450c96bdad82be797ac8a8d3f83) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): complete stale `prompt=login consent` continuations after forced login

  Consent continuations now carry the signed authorization request issue time and
  only clear a lingering `login` prompt when the active session was created for
  that request. This preserves forced reauthentication semantics while avoiding
  the loop where a completed reauthentication is sent back to `/login`.

- [#9406](https://github.com/better-auth/better-auth/pull/9406) [`d427d1d`](https://github.com/better-auth/better-auth/commit/d427d1dba91db8861d935ca5838f49eb7e617f67) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Export OAuth provider helper types used by public declarations so downstream declaration emit can name auth instances portably.

- [#9324](https://github.com/better-auth/better-auth/pull/9324) [`6b03a45`](https://github.com/better-auth/better-auth/commit/6b03a45a14d905aa070068290adfedfd4c5f4e2d) Thanks [@dvanmali](https://github.com/dvanmali)! - Make `sessionId` optional in refresh token types to match the refresh token schema.

- Updated dependencies [[`1e0f26d`](https://github.com/better-auth/better-auth/commit/1e0f26d4c83608d14a533f33458ade0f8504fd16), [`8c1e917`](https://github.com/better-auth/better-auth/commit/8c1e91757d91d103c332e90201c39ce5892c37e8), [`b2d655c`](https://github.com/better-auth/better-auth/commit/b2d655c77c7c627ada17456d1de106fdce6fa18e), [`09f1327`](https://github.com/better-auth/better-auth/commit/09f1327acb9c6bbfeb272dc62c7013172cf33153), [`906b7b3`](https://github.com/better-auth/better-auth/commit/906b7b34a710d49798e166395da2bcd2be13ef46), [`e9c978e`](https://github.com/better-auth/better-auth/commit/e9c978e2af9e61d35f50fd040305cbb8fdda32ba), [`e71aad3`](https://github.com/better-auth/better-auth/commit/e71aad3b6d67502cfb770fa8890f3ab58c537114), [`80a655d`](https://github.com/better-auth/better-auth/commit/80a655d271dcae5f785a70f13be60f80fb828cf1), [`15ff28a`](https://github.com/better-auth/better-auth/commit/15ff28a957a18df8ecd2aa08d66b94c91ae9a6a4), [`88a7c67`](https://github.com/better-auth/better-auth/commit/88a7c678f4db3f7da580d53071b2595b92354a45), [`9a7b51d`](https://github.com/better-auth/better-auth/commit/9a7b51d0d3dfbc6b2697fe5f9edd0bb480bdf89b), [`1b25902`](https://github.com/better-auth/better-auth/commit/1b259024dcd1bbbc08559ee057f22c01929a72a7), [`cf59136`](https://github.com/better-auth/better-auth/commit/cf591360e72a8d01741618cd61cdeea84cf8398a), [`a597ee0`](https://github.com/better-auth/better-auth/commit/a597ee01ed4e6d85aba5ee9f15100acc578390d9), [`fc02ced`](https://github.com/better-auth/better-auth/commit/fc02cedb708e2b5987a177539a903cc35155a426), [`9f1ef1f`](https://github.com/better-auth/better-auth/commit/9f1ef1f7e5500e0b3dbe2a18e25e3519847cd7a9), [`36ef808`](https://github.com/better-auth/better-auth/commit/36ef808c6cedec6eeb9a3a4e6790e0ab46d96ff3), [`c1336c5`](https://github.com/better-auth/better-auth/commit/c1336c563d45f93ca3fd4da4e6c767fc267d86d0), [`3a9a2c3`](https://github.com/better-auth/better-auth/commit/3a9a2c37eeab1d0c98845a47642d4dc27fe54ceb), [`fde0432`](https://github.com/better-auth/better-auth/commit/fde043207ef3d5a5e1f74aa5ddabf77d523d52d4), [`2220a6d`](https://github.com/better-auth/better-auth/commit/2220a6d6c25ebd24c8568131636389dc0c12f82b)]:
  - better-auth@1.6.10
  - @better-auth/core@1.6.10

## 1.6.9

### Patch Changes

- Updated dependencies [[`815ecf6`](https://github.com/better-auth/better-auth/commit/815ecf62b6f6c5bf656ab55da393ce63d7eed0a6)]:
  - @better-auth/core@1.6.9
  - better-auth@1.6.9

## 1.6.8

### Patch Changes

- [#9328](https://github.com/better-auth/better-auth/pull/9328) [`8e3cc34`](https://github.com/better-auth/better-auth/commit/8e3cc3453c8e0b066dd3ba3d492d9494a1670d62) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oauth-provider): accept authorization-code flows without `state`

  Align authorization-code verification with the authorize endpoint and OAuth/OIDC semantics by treating `state` as optional for the authorization server. The provider still echoes `state` when present, and Better Auth client helpers continue to generate and validate it.

- Updated dependencies [[`856ab24`](https://github.com/better-auth/better-auth/commit/856ab2426c0dce7377ee1ca26dbb7d9e52fb6429), [`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3)]:
  - better-auth@1.6.8
  - @better-auth/core@1.6.8

## 1.6.7

### Patch Changes

- [#9244](https://github.com/better-auth/better-auth/pull/9244) [`4e0e6e1`](https://github.com/better-auth/better-auth/commit/4e0e6e1fd32705063cf4831c0339212066aa369f) Thanks [@TanishValesha](https://github.com/TanishValesha)! - read OAuth2 userinfo `Authorization` from `ctx.headers` when `ctx.request` is absent, so `auth.api.oauth2UserInfo({ headers })` matches HTTP `GET /oauth2/userinfo`.

- Updated dependencies [[`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162), [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5), [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb), [`e1b1cfc`](https://github.com/better-auth/better-auth/commit/e1b1cfc7a262c8bf0c383a7b2b1d140472d33e56), [`d053a45`](https://github.com/better-auth/better-auth/commit/d053a4583e0db9132e52a100ae33e13d040a6bae)]:
  - better-auth@1.6.7
  - @better-auth/core@1.6.7

## 1.6.6

### Patch Changes

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

- Updated dependencies [[`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7), [`4debfb6`](https://github.com/better-auth/better-auth/commit/4debfb600ff448f3e63ed242a2fb5a2c41654be1), [`9ea7eb1`](https://github.com/better-auth/better-auth/commit/9ea7eb1eab28d50d40836ab4e2cbe5a81c4da1aa), [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b), [`ab4c10f`](https://github.com/better-auth/better-auth/commit/ab4c10fbc09defcd851d614acecc111cc114b543), [`a61083e`](https://github.com/better-auth/better-auth/commit/a61083e023163d0a14d9e886ce556ba459677428), [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da)]:
  - @better-auth/core@1.6.6
  - better-auth@1.6.6

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
