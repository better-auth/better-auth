# @better-auth/core

## 1.7.0-beta.5

### Minor Changes

- [#9828](https://github.com/better-auth/better-auth/pull/9828) [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Verify social-provider id_tokens with a single shared verifier.

  Client-submitted id_token sign-in (`signIn.social({ idToken })` and account linking) is verified by one function instead of a per-provider `verifyIdToken` method. Each provider declares an `idToken` config with a JWKS source, issuer, and audience, and the core verifier runs the signature, issuer, audience, and nonce checks. A provider that declares no config rejects the client id_token path.

  PayPal previously accepted any decodable id_token without verifying its signature. PayPal derives identity from the access token, so it now declares no `idToken` config, and the client id_token path returns `ID_TOKEN_NOT_SUPPORTED`. PayPal sign-in through the redirect flow is unchanged.

  Custom providers that implement `UpstreamProvider` directly replace the removed `verifyIdToken` method with an `idToken` config:

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

- [#9864](https://github.com/better-auth/better-auth/pull/9864) [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Add a `user.validateUserInfo` provisioning gate that lets applications reject an identity before a user is created or a new account is linked. It runs once at the creation step for every method that provisions a user (OAuth, SSO/SAML, email/password, magic link, email OTP, anonymous, SIWE, phone number, admin-created users, and SCIM), including stateless setups with no persistent database.

  It also re-runs when an existing OAuth or SSO user signs in again (`source.action` is `"sign-in"`), where it receives the fresh provider email and profile so a domain or org policy can reject a user whose provider identity moved out of bounds. Non-provider returning sign-ins are not re-validated.

  The callback receives the mapped `user` plus a `source` describing the `action` (`create-user`, `link-account`, or `sign-in`), the `method`, and provider metadata: `source.oauth` for OAuth providers and `source.sso` for OIDC/SAML SSO providers. Return `{ error, errorDescription }` to reject: browser flows redirect to the error URL and programmatic flows return a `403`.

### Patch Changes

- [#9898](https://github.com/better-auth/better-auth/pull/9898) [`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2) Thanks [@ItalyPaleAle](https://github.com/ItalyPaleAle)! - Add `clientAssertion` support to the Microsoft Entra ID social provider.

## 1.7.0-beta.4

## 1.6.18

### Patch Changes

- [#9583](https://github.com/better-auth/better-auth/pull/9583) [`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Fix plugin-provided client methods and additional session fields not being inferred in composite monorepos.

## 1.6.17

### Patch Changes

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add the optional `incrementOne` adapter method and the optional `SecondaryStorage.increment` method. `incrementOne` atomically applies signed numeric deltas to a single row under a where-clause guard (for example, decrementing a remaining-uses counter only while it is still positive) and returns the updated row, or null when the guard matched no row. Adapters that do not implement it natively keep working through a transaction-based fallback. `SecondaryStorage.increment` atomically increments a counter and sets its time-to-live only when the key is first created.

- [#9987](https://github.com/better-auth/better-auth/pull/9987) [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8) Thanks [@bytaesu](https://github.com/bytaesu)! - Fixed a memory leak where the JWKS cache could grow on every access token verification.

- [#10003](https://github.com/better-auth/better-auth/pull/10003) [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Microsoft Entra ID sign-in now honors the configured tenant restriction. `tenantId: "organizations"` rejects personal Microsoft accounts, and `tenantId: "consumers"` rejects work and school accounts. Both were accepted before.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Concurrent requests can no longer slip past the configured rate limit. The in-memory rate-limit store no longer grows without bound, and the database backend removes expired entries on its own. A custom rate-limit storage may implement a new optional `consume` method for strict enforcement; without it, the previous behavior is kept and a one-time warning is logged.

- [#10003](https://github.com/better-auth/better-auth/pull/10003) [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A Reddit user with no email now receives a non-routable placeholder address (`<id>@reddit.invalid`) instead of one on the real `reddit.com` domain, so it cannot match a deliverable mailbox. The address stays unverified, and `mapProfileToUser` can supply a real email.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `internalAdapter.reserveVerificationValue`. It atomically records a single-use marker (such as a replay tombstone) so that exactly one of several concurrent callers succeeds and the rest observe that the marker is already taken. Database-backed verification storage is atomic; secondary-storage-only verification is best-effort.

- [#9990](https://github.com/better-auth/better-auth/pull/9990) [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Hardens how requests are trusted across several flows. Rate limiting is now enforced even when a client IP cannot be determined, instead of being skipped. When `baseURL` is not configured, password-reset and verification links use the current request's host rather than the host of the first request the server handled, and a request-scoped `trustedOrigins` callback no longer affects other concurrent requests. The OAuth proxy, Google One Tap, and the Expo authorization proxy reject redirect and callback targets that are not in `trustedOrigins`. Google reCAPTCHA and Cloudflare Turnstile accept optional `expectedAction` and `allowedHostnames` to reject tokens minted for a different action or hostname. Server-side fetches reject additional reserved IPv6 ranges, and malformed redirect parameters return a 400 instead of a 500.

- [#10003](https://github.com/better-auth/better-auth/pull/10003) [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - WeChat sign-in now succeeds with the documented default setup, which previously failed because WeChat returns no email address. The created user receives a stable, unverified placeholder email; supply a real one with `mapProfileToUser`.

## 1.6.16

### Patch Changes

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Validate Facebook opaque access tokens against the configured app. Previously `verifyIdToken` returned `true` for any non-JWT token and `getUserInfo` called Graph `/me` with the caller-supplied token without checking which app issued it, so tokens issued for other Facebook apps were not distinguished on the direct sign-in path. Facebook tokens are now inspected via the `debug_token` endpoint, requiring `is_valid`, an `app_id` that matches one of the configured client ids, and a `user_id` that matches the returned profile, before the token is accepted. A client secret must be configured for access-token sign-in to work.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Enforce the Google `hd` (hosted domain) option against the id token. Previously `hd` was only sent to Google as an authorization hint, which does not by itself restrict sign-in to the configured Workspace domain. When `hd` is set, the `hd` claim on the verified id token (`verifyIdToken`) and the decoded callback profile (`getUserInfo`) must be present and match, otherwise sign-in is rejected.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Scope the JWKS cache per source. Access-token verification previously kept a single global key set and reused it whenever it contained a key matching the token's `kid`, without considering which JWKS source the verification was for. When verifying tokens against more than one source, a token could end up matched against keys fetched for a different source if the two shared a `kid`. The cache is now keyed per JWKS source and honors a TTL, so each verification uses the keys for its own source and rotated or removed keys are no longer used after the TTL elapses.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Cryptographically verify PayPal ID tokens on direct sign-in. Previously `verifyIdToken` only decoded the JWT and checked that a `sub` claim was present, performing no signature, issuer, audience, or expiration checks, so any well-formed token paired with a valid access token would be accepted. The token is now verified against PayPal's issuer and published JWKS (RS256) or the client secret (HS256), with the `aud` pinned to the configured `clientId`, a `maxTokenAge` bound, and the `nonce` checked when supplied.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Stop mapping the Reddit `oauth_client_id` to the user's email. Reddit's `identity` scope does not return an email address, and the provider previously stored `oauth_client_id` (which identifies the OAuth application and is the same for every user of the app) as `user.email` with `has_verified_email` as `emailVerified`. This collapsed all Reddit users of the same app onto a single "verified" email, which could enable implicit account linking/takeover. The Reddit provider now uses the email returned from `mapProfileToUser` when provided, otherwise falls back to a unique per-user synthetic address (`<reddit-user-id>@reddit.com`), and no longer marks it as verified. Provide a real email via `mapProfileToUser` if you need the actual address.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Fix `verifyAccessToken` silently dropping the configured audience check during remote introspection. Previously, when a required `audience` was set in `verifyOptions` but the introspection response omitted the `aud` claim, audience validation was skipped and any active token from the issuer was accepted — so a token issued for a different resource or client on the same issuer could also pass verification. Verification now requires the claim: a missing or mismatching `aud` is rejected. Authorization servers that legitimately omit `aud` from introspection responses (it is OPTIONAL per RFC 7662) can opt back into the old behavior with the new `remoteVerify.allowMissingAudience: true` flag, which still rejects mismatching audiences.

## 1.6.15

## 1.6.14

### Patch Changes

- [#9845](https://github.com/better-auth/better-auth/pull/9845) [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

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

## 1.7.0-beta.3

## 1.7.0-beta.2

## 1.7.0-beta.1

## 1.7.0-beta.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `private_key_jwt` (RFC 7523) client authentication across the stack. Servers verify JWT client assertions signed with asymmetric keys; clients sign them for authorization code, refresh, and client credentials flows.

## 1.6.10

### Patch Changes

- [#9395](https://github.com/better-auth/better-auth/pull/9395) [`2220a6d`](https://github.com/better-auth/better-auth/commit/2220a6d6c25ebd24c8568131636389dc0c12f82b) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Route Cloudflare Workers instrumentation imports to the pure no-op entry when OpenTelemetry is not installed.

## 1.6.9

### Patch Changes

- [#9340](https://github.com/better-auth/better-auth/pull/9340) [`815ecf6`](https://github.com/better-auth/better-auth/commit/815ecf62b6f6c5bf656ab55da393ce63d7eed0a6) Thanks [@erquhart](https://github.com/erquhart)! - fix(core): self-reference `./instrumentation` in the adapter factory so the `exports` map routes edge/browser to the pure variant

## 1.6.8

### Patch Changes

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

## 1.6.7

### Patch Changes

- [#9211](https://github.com/better-auth/better-auth/pull/9211) [`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162) Thanks [@stewartjarod](https://github.com/stewartjarod)! - Preserve `Set-Cookie` headers accumulated on `ctx.responseHeaders` when an endpoint throws `APIError`. Cookie side-effects from `deleteSessionCookie` (and any `ctx.setCookie` / `ctx.setHeader` calls before the throw) are no longer silently discarded on the error path.

- [#9281](https://github.com/better-auth/better-auth/pull/9281) [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5) Thanks [@ramonclaudio](https://github.com/ramonclaudio)! - fix(core): serve noop `./instrumentation` on `browser`/`edge` conditions, matching `./async_hooks`

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

## 1.6.6

### Patch Changes

- [#9227](https://github.com/better-auth/better-auth/pull/9227) [`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7) Thanks [@bytaesu](https://github.com/bytaesu)! - feat(core): add `mapConcurrent` bounded-concurrency utility at `@better-auth/core/utils/async`

- [#9111](https://github.com/better-auth/better-auth/pull/9111) [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b) Thanks [@jonathansamines](https://github.com/jonathansamines)! - `@opentelemetry/api` is now an optional peer dependency

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

## 1.6.5

## 1.6.4

## 1.6.3

## 1.6.2

## 1.6.1

## 1.6.0

### Patch Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Skip recording redirect APIErrors as span errors in OpenTelemetry traces

## 1.6.0-beta.0

### Patch Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Skip recording redirect APIErrors as span errors in OpenTelemetry traces
