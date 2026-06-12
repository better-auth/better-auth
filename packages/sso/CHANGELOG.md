# @better-auth/sso

## 1.7.0-beta.5

### Patch Changes

- [#9930](https://github.com/better-auth/better-auth/pull/9930) [`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Anonymous account linking now works after social and generic OAuth sign-in in Expo and other in-app browsers, where the OAuth callback returns without the session cookie. `onLinkAccount` fires and the anonymous user is migrated; before, it was silently skipped.

  Plugins can now carry server-trusted data across an OAuth redirect with the new `addOAuthServerContext` API, read back on the callback via `getOAuthState().serverContext`. Unlike `additionalData`, it cannot be set from the request body, so it is the right place for values the server must trust.

  For `@better-auth/oauth-provider`, the post-login authorization query now travels through that server-only channel, so it can no longer be injected through `additionalData`.

- [#9864](https://github.com/better-auth/better-auth/pull/9864) [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Add a `user.validateUserInfo` provisioning gate that lets applications reject an identity before a user is created or a new account is linked. It runs once at the creation step for every method that provisions a user (OAuth, SSO/SAML, email/password, magic link, email OTP, anonymous, SIWE, phone number, admin-created users, and SCIM), including stateless setups with no persistent database.

  It also re-runs when an existing OAuth or SSO user signs in again (`source.action` is `"sign-in"`), where it receives the fresh provider email and profile so a domain or org policy can reject a user whose provider identity moved out of bounds. Non-provider returning sign-ins are not re-validated.

  The callback receives the mapped `user` plus a `source` describing the `action` (`create-user`, `link-account`, or `sign-in`), the `method`, and provider metadata: `source.oauth` for OAuth providers and `source.sso` for OIDC/SAML SSO providers. Return `{ error, errorDescription }` to reject: browser flows redirect to the error URL and programmatic flows return a `403`.

- Updated dependencies [[`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5), [`e014029`](https://github.com/better-auth/better-auth/commit/e0140297a59ddb59cccbcb4ba46c513de8cb86a7), [`ec8a38c`](https://github.com/better-auth/better-auth/commit/ec8a38c08f5cfe2d922be0f8a49f2d0fa84de799), [`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2), [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f), [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f), [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b), [`76a3342`](https://github.com/better-auth/better-auth/commit/76a33429fc2a3edcc85307bf81b9d92a95f9de6c), [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f)]:
  - better-auth@1.7.0-beta.5
  - @better-auth/core@1.7.0-beta.5

## 1.7.0-beta.4

### Minor Changes

- [#8805](https://github.com/better-auth/better-auth/pull/8805) [`602ec40`](https://github.com/better-auth/better-auth/commit/602ec40293dc141eab134ddb53ab34b44e11d103) Thanks [@OscarCornish](https://github.com/OscarCornish)! - **Rolling certificate rotation**

  SAML signing certificates now accept an array of PEM strings, so administrators can publish a new IdP cert alongside the old one and complete the rotation without forcing every active session to re-authenticate. Responses signed by any listed cert are accepted.

  ```ts
  samlConfig: {
      idpMetadata: {
          cert: [currentPem, nextPem],
      },
  }
  ```

  Both `samlConfig.cert` and `samlConfig.idpMetadata.cert` accept either a single PEM string or an array. When both are set, `idpMetadata.cert` wins.

  **Breaking: response shape**

  The management endpoints (`getSSOProvider`, `listSSOProviders`, `updateSSOProvider`) now return `samlConfig.certificate` as an array of parsed certificates in every case, even when a single cert is configured. The field is absent only when certs live inside `idpMetadata.metadata`. Update consumers to read an array; no more `Array.isArray` branching.

  **Validation**

  Registration now rejects SAML configs that supply no signing-cert source. samlify needs either an `idpMetadata.metadata` XML document (which embeds the certs) or an explicit PEM under `cert` or `idpMetadata.cert`. Configs missing both fail with `CERT_SOURCE_MISSING`.

  **Fix**

  SAML Single Logout could fail to decrypt encrypted `LogoutResponse` payloads because the IdP entity was constructed without `privateKey`, `encPrivateKey`, or `encPrivateKeyPass` on that code path. All three are now applied on every IdP construction.

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

## 1.6.18

### Patch Changes

- Updated dependencies [[`9ef7240`](https://github.com/better-auth/better-auth/commit/9ef7240fec4a9d8469dd5ed24249949d3400e732), [`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c)]:
  - better-auth@1.6.18
  - @better-auth/core@1.6.18

## 1.6.17

### Patch Changes

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A SAML assertion submitted twice at the same time can no longer be accepted more than once; replay protection now holds under concurrent requests.

- [#10003](https://github.com/better-auth/better-auth/pull/10003) [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - With `trustEmailVerified` enabled, an OIDC `email_verified` claim or mapped SAML attribute whose value is the string `"false"` is no longer treated as a verified email. Only a boolean `true` or the string `"true"` counts as verified.

- [#10002](https://github.com/better-auth/better-auth/pull/10002) [`ed7b6c9`](https://github.com/better-auth/better-auth/commit/ed7b6c9ac0fa2bb7f246f552b41046302ef8138c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Organization admins and owners can now request and verify domain ownership for an SSO provider their organization owns, even if another member registered it. Previously only the member who created the provider could verify its domain.

- Updated dependencies [[`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`3e99e6c`](https://github.com/better-auth/better-auth/commit/3e99e6c77ef788377a3ddb7abe790c7dc3df1493), [`96c78c3`](https://github.com/better-auth/better-auth/commit/96c78c3e983ab3a2d914780fcc5d66d90537f9ac), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`ed7b6c9`](https://github.com/better-auth/better-auth/commit/ed7b6c9ac0fa2bb7f246f552b41046302ef8138c), [`e0a768c`](https://github.com/better-auth/better-auth/commit/e0a768c973f9d9ccd4aee959efcbe1fbcc2e608d), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`d9c526b`](https://github.com/better-auth/better-auth/commit/d9c526b2a57afe9e01ff25da400f1d634b4c1ac7), [`0c3856f`](https://github.com/better-auth/better-auth/commit/0c3856f098f4a130abc49e9003ebc285824b0ba7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`8960f5f`](https://github.com/better-auth/better-auth/commit/8960f5f3bd2f0dccbfb768d69737d8a24d793a9e), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`5c289b5`](https://github.com/better-auth/better-auth/commit/5c289b52bc166be3a36ec3c112b04195dc7621d8), [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`59e0ccb`](https://github.com/better-auth/better-auth/commit/59e0ccbedc6c336b1e77f71c62484d654fd2fca3), [`b803c61`](https://github.com/better-auth/better-auth/commit/b803c61fdcfc64be4e26bf6fa10953621f0070cc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7)]:
  - better-auth@1.6.17
  - @better-auth/core@1.6.17

## 1.6.16

### Patch Changes

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Validate OIDC endpoints fetched server-side (token, userinfo, jwks) at request time by resolving the hostname and rejecting any host that resolves to a non-publicly-routable address. Discovery and userinfo requests no longer auto-follow redirects to unvalidated hosts. Operator-allowlisted origins (`trustedOrigins`) remain exempt for internal IdPs.

- [#9974](https://github.com/better-auth/better-auth/pull/9974) [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15) Thanks [@Bekacru](https://github.com/Bekacru)! - Separate SSO provider ids from the account-linking provider namespace used for social/OAuth providers. Previously an SSO provider registered with an id matching a configured `accountLinking.trustedProviders` entry (e.g. `google`) was treated as a trusted provider and could implicitly link to an existing verified account with the same email.

  SSO registration now rejects provider ids that collide with a configured social provider, a `trustedProviders` entry, or a reserved built-in id. In addition, the OIDC and SAML callbacks no longer derive trust from a `trustedProviders` name match — SSO trust comes solely from verified domain ownership (`domainVerified`). `handleOAuthUserInfo` gains a `trustProviderByName` option (default `true`, preserving social-provider behavior) that the SSO plugin sets to `false`.

- Updated dependencies [[`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`87e7aa5`](https://github.com/better-auth/better-auth/commit/87e7aa5e0fd8f19b326beb5bec409a9ed1f245ca), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`893cf6c`](https://github.com/better-auth/better-auth/commit/893cf6cb3f1f2669b39f6ac8d3d49cf830e5732e), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`5e49c56`](https://github.com/better-auth/better-auth/commit/5e49c56a9e12a9b6b3fd1202bbc7a2fc97aeeafd), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15)]:
  - better-auth@1.6.16
  - @better-auth/core@1.6.16

## 1.6.15

### Patch Changes

- [#9748](https://github.com/better-auth/better-auth/pull/9748) [`bff65fd`](https://github.com/better-auth/better-auth/commit/bff65fd620ac62d72c24c9ed79badf1e31cf1a39) Thanks [@seebykilian](https://github.com/seebykilian)! - When clockSkew is configured in the SSO plugin's SAML options, it was only
  applied to better-auth's internal validation but never passed down to samlify's
  ServiceProvider. As a result, samlify used its default [0, 0] clock drift,
  causing ERR_SUBJECT_UNCONFIRMED errors on valid SAML responses whenever there
  was any clock difference between the SP and the IdP.

  This affects any standard IdP (Auth0, Keycloak, Okta, etc.) even when the SAML
  response is fully valid and the server time is well within the
  NotBefore/NotOnOrAfter window.

  This is now fixed.

- Updated dependencies [[`1012b69`](https://github.com/better-auth/better-auth/commit/1012b690466ccd7078441dbfb406eef166fca805), [`ad60333`](https://github.com/better-auth/better-auth/commit/ad60333d1517142d688c61b6ccee14b4c30864ae), [`0933c05`](https://github.com/better-auth/better-auth/commit/0933c050ff8735466a273347c9aab0fdd8cd38ff), [`b0ddfd3`](https://github.com/better-auth/better-auth/commit/b0ddfd3433cafac312ee99ec5fb7dbb9a240da35)]:
  - better-auth@1.6.15
  - @better-auth/core@1.6.15

## 1.6.14

### Patch Changes

- Updated dependencies [[`2d9781a`](https://github.com/better-auth/better-auth/commit/2d9781a83ddc7b51ecffbd7d24c28e4b917e2323), [`5a2d642`](https://github.com/better-auth/better-auth/commit/5a2d642bc7d940f4242df9b304818a8653ea2a10), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f), [`9d3450a`](https://github.com/better-auth/better-auth/commit/9d3450ae23e8387d24adfb7bb1cb24cc6965b6e3)]:
  - better-auth@1.6.14
  - @better-auth/core@1.6.14

## 1.6.13

### Patch Changes

- [#9301](https://github.com/better-auth/better-auth/pull/9301) [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `allowIdpInitiated` to `GenericOAuthConfig` and SSO `OIDCConfig` to support providers that initiate OAuth without a `state` parameter (e.g. Clever). When enabled, stateless callbacks restart the OAuth flow server-side with fresh state and PKCE, preserving CSRF protection. Also hardens `parseState` against undefined request bodies on GET callbacks.

- [#9657](https://github.com/better-auth/better-auth/pull/9657) [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden `private_key_jwt` and token endpoint client authentication, and add the helpers that make the fix structural.

  `@better-auth/core/oauth2` now exposes `encodeBasicCredentials` and `decodeBasicCredentials`, a round-trip-tested pair that follows RFC 6749 §2.3.1 (`application/x-www-form-urlencoded` each value, split on the first `:` only). The decoder accepts the scheme case-insensitively and tolerates one or more spaces before the credentials per RFC 7235 §2.1. `client_secret_basic` on the client side and the Better Auth OAuth provider on the server side both go through these helpers, so credentials containing reserved characters round-trip cleanly across the stack and headers like `basic xxx` or `Basic  xxx` are accepted.

  `createPrivateKeyJwtClientAssertionGetter` validates options eagerly. Unsupported algorithms (`HS256`, `none`), a JWK with no key material, and disagreement between an explicit `algorithm` and the JWK-embedded `alg` all throw at construction rather than on the first token request. `signPrivateKeyJwtClientAssertion` enforces the same checks for direct callers. **Breaking:** configurations that paired an unsupported JWK `alg` with a different explicit `algorithm` used to silently sign with the explicit option; they now fail at construction.

  `@better-auth/oauth-provider` rejects empty `jwks` payloads at the schema layer (`jwks: []` and `jwks: { keys: [] }`) so the documented client metadata contract matches what `checkOAuthClient` already enforces at runtime. Schema consumers (TypeScript, OpenAPI, generated SDKs) now see the constraint.

  The SSO `private_key_jwt` flow redirects with `error_description=no_private_key_available` when a `resolvePrivateKey` callback returns no `privateKeyJwk` or `privateKeyPem`. The redirect path previously short-circuited only when the resolver was absent entirely; an empty resolver return fell through into an internal signing error.

  `better-auth/test` adds `getHttpTestInstance`, a counterpart to `getTestInstance` that binds a real HTTP listener on an OS-assigned port and constructs the auth instance against the discovered URL. It removes the temp-server-then-rebind race that test files have been individually copy-pasting.

- Updated dependencies [[`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8), [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - better-auth@1.7.0-beta.4
  - @better-auth/core@1.7.0-beta.4

## 1.7.0-beta.3

### Patch Changes

- Updated dependencies [[`4e8e4c7`](https://github.com/better-auth/better-auth/commit/4e8e4c7fc5fb2723144cbf41c4a1bfa28de8d671), [`523f95c`](https://github.com/better-auth/better-auth/commit/523f95c10db24b790bbd75fe85c86c34d3465267), [`729c00d`](https://github.com/better-auth/better-auth/commit/729c00d74c94f558893da1e3a9ee86451d1b23da)]:
  - better-auth@1.7.0-beta.3
  - @better-auth/core@1.7.0-beta.3

## 1.7.0-beta.2

### Patch Changes

- Updated dependencies [[`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4), [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09), [`954b664`](https://github.com/better-auth/better-auth/commit/954b664f4f251f8dd028451dab3ab43067dbf890), [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - better-auth@1.7.0-beta.2
  - @better-auth/core@1.7.0-beta.2

## 1.7.0-beta.1

### Minor Changes

- [#9117](https://github.com/better-auth/better-auth/pull/9117) [`b70f025`](https://github.com/better-auth/better-auth/commit/b70f025bfaad38c229305a25e87e08bc176f9503) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - ### Breaking: SAML configuration changes

  **`callbackUrl` removed from `samlConfig`.**
  The ACS URL is now always derived from your `baseURL` and `providerId`. Remove `callbackUrl` from your SAML provider configuration. The post-login redirect destination is set per sign-in via `callbackURL` in `signIn.sso()`:

  ```ts
  await authClient.signIn.sso({
    providerId: "my-provider",
    callbackURL: "/dashboard",
  });
  ```

  **`/sso/saml2/callback/:providerId` endpoint removed.**
  Update your IdP's ACS URL to `/sso/saml2/sp/acs/:providerId`. This endpoint handles both GET and POST requests.

  **`spMetadata` is now optional.**
  You no longer need to pass `spMetadata: {}` when registering a provider. SP metadata is auto-generated from your configuration.

  **Removed unused fields from `SAMLConfig`:**
  `decryptionPvk`, `additionalParams`, `idpMetadata.entityURL`, `idpMetadata.redirectURL`. These were stored but never read. Remove them from your configuration if present.

  ### Bug fixes
  - Fix SLO SessionIndex matching: LogoutRequests with a SessionIndex were silently failing to delete the correct session.
  - Audience validation now defaults to the SP entity ID when `audience` is not configured, per SAML Core section 2.5.1.
  - Restore `AllowCreate` in AuthnRequests, required by IdPs that use JIT provisioning.
  - SP metadata endpoint now reflects actual SP capabilities (encryption, signing, SLO).

### Patch Changes

- [#9121](https://github.com/better-auth/better-auth/pull/9121) [`9603043`](https://github.com/better-auth/better-auth/commit/960304354aebab2f03c0fadd0d7bfd02febfd246) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - ### Security: upgrade samlify to 2.12.0

  Upgrades the SAML XML processing library from 2.10.2 to 2.12.0:
  - **XPath injection protection**: all XPath expressions now use value escaping instead of string interpolation
  - **XXE prevention**: the XML parser defaults to strict mode that rejects entity references
  - **Dependency reduction**: removes `node-forge`, `pako`, `uuid`, and `camelcase` in favor of Node built-ins

  PEM keys and certificates with leading whitespace are now normalized automatically before being passed to samlify. This prevents `DECODER routines::unsupported` errors when keys are copied from indented config files or environment variables.

  Requires Node 20+.

- Updated dependencies [[`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45), [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f), [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f), [`c7d2253`](https://github.com/better-auth/better-auth/commit/c7d22539ec4f7322d9625ae2953d397c3863d097), [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7), [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af), [`6f2948e`](https://github.com/better-auth/better-auth/commit/6f2948e87bb5fa14bd2174a91f7143e1eced1b87)]:
  - better-auth@1.7.0-beta.1
  - @better-auth/core@1.7.0-beta.1

## 1.7.0-beta.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `private_key_jwt` (RFC 7523) client authentication across the stack. Servers verify JWT client assertions signed with asymmetric keys; clients sign them for authorization code, refresh, and client credentials flows.

- [#9055](https://github.com/better-auth/better-auth/pull/9055) [`b790144`](https://github.com/better-auth/better-auth/commit/b790144a2e969f1f423c1226147edfb4e69664d1) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(sso)!: harden SAML response validation (InResponseTo, Audience, SessionIndex)

  ### Breaking Changes
  - **`allowIdpInitiated` now defaults to `false`** — IdP-initiated SSO (unsolicited SAML responses) is disabled by default. Set `saml.allowIdpInitiated: true` to restore the previous behavior. This aligns with the SAML2Int interoperability profile which recommends against IdP-initiated SSO due to its susceptibility to injection attacks.

  ### Bug Fixes
  - **InResponseTo validation was completely non-functional** — The code read `extract.inResponseTo` (always `undefined`) instead of samlify's actual path `extract.response.inResponseTo`. SP-initiated InResponseTo validation now works as intended in both ACS handlers.
  - **Audience Restriction was never validated** — SAML assertions issued for a different service provider were accepted without checking the `<AudienceRestriction>` element. Audience is now validated against the configured `samlConfig.audience` value per SAML 2.0 Core §2.5.1.
  - **SessionIndex stored as object instead of string** — samlify returns `sessionIndex` from login responses as `{ authnInstant, sessionNotOnOrAfter, sessionIndex }`, but the code stored the whole object. SLO session-index comparisons always failed silently. The correct inner `sessionIndex` string is now extracted.

  ### Improvements
  - Extracted shared `validateInResponseTo()` and `validateAudience()` into `packages/sso/src/saml/response-validation.ts`, eliminating ~160 lines of duplicated validation logic between the two ACS handlers.
  - Fixed `SAMLAssertionExtract` type to match samlify's actual extractor output shape.

## 1.6.10

### Patch Changes

- [#9398](https://github.com/better-auth/better-auth/pull/9398) [`006e809`](https://github.com/better-auth/better-auth/commit/006e809b92d4a933e52a4684b74419bc419530dc) Thanks [@Craga89](https://github.com/Craga89)! - fix(sso): use findSAMLProvider in spMetadata so defaultSSO providers resolve

  `/sso/saml2/sp/metadata` was the only SAML endpoint that called `adapter.findOne`
  directly, so providers configured via `defaultSSO` (which are not persisted to the
  database) caused it to throw `NOT_FOUND`. The endpoint now uses the shared
  `findSAMLProvider` helper, matching `signInSSO`, the SAML callback handler, and
  `signOut`.

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

- Updated dependencies [[`856ab24`](https://github.com/better-auth/better-auth/commit/856ab2426c0dce7377ee1ca26dbb7d9e52fb6429), [`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3)]:
  - better-auth@1.6.8
  - @better-auth/core@1.6.8

## 1.6.7

### Patch Changes

- Updated dependencies [[`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162), [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5), [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb), [`e1b1cfc`](https://github.com/better-auth/better-auth/commit/e1b1cfc7a262c8bf0c383a7b2b1d140472d33e56), [`d053a45`](https://github.com/better-auth/better-auth/commit/d053a4583e0db9132e52a100ae33e13d040a6bae)]:
  - better-auth@1.6.7
  - @better-auth/core@1.6.7

## 1.6.6

### Patch Changes

- [#9262](https://github.com/better-auth/better-auth/pull/9262) [`fe5f36c`](https://github.com/better-auth/better-auth/commit/fe5f36c7e3630373d9b1765c28a8cd81e841eff8) Thanks [@jonathansamines](https://github.com/jonathansamines)! - Fix ESM/CJS compat issue when loading samlify

- Updated dependencies [[`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7), [`4debfb6`](https://github.com/better-auth/better-auth/commit/4debfb600ff448f3e63ed242a2fb5a2c41654be1), [`9ea7eb1`](https://github.com/better-auth/better-auth/commit/9ea7eb1eab28d50d40836ab4e2cbe5a81c4da1aa), [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b), [`ab4c10f`](https://github.com/better-auth/better-auth/commit/ab4c10fbc09defcd851d614acecc111cc114b543), [`a61083e`](https://github.com/better-auth/better-auth/commit/a61083e023163d0a14d9e886ce556ba459677428), [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da)]:
  - @better-auth/core@1.6.6
  - better-auth@1.6.6

## 1.6.5

### Patch Changes

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

- [#9097](https://github.com/better-auth/better-auth/pull/9097) [`52c4751`](https://github.com/better-auth/better-auth/commit/52c47517a21600d40a3e82c427409083b4a0a9ec) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(sso): unify SAML response processing and fix provider/config bugs

  **Bug fixes:**
  - Fix SP metadata endpoint using internal row ID instead of `providerId` in ACS URL
  - Fix `acsEndpoint` skipping DB provider lookup when `defaultSSO` is configured
  - Fix `acsEndpoint` missing encryption fields (`isAssertionEncrypted`, `encPrivateKey`), which caused silent decryption failures
  - Fix `defaultSSO` config parsing in callback path (`safeJsonParse` on already-parsed objects)
  - Fix `createSP` missing `callbackUrl` fallback to auto-generated ACS URL
  - Complete `createSP`/`createIdP` helpers with all encryption and signing fields

  **Behavioral changes:**
  - ACS error redirect query parameters now use uppercase error codes (e.g. `error=SAML_MULTIPLE_ASSERTIONS` instead of `error=multiple_assertions`). If your application parses these error codes from the redirect URL, update the expected values.
  - SAML provider registration now rejects configs with no usable IdP entry point (no valid `entryPoint` URL, no `idpMetadata.metadata`, and no `idpMetadata.singleSignOnService`). Previously these would register successfully but fail at sign-in.
  - `entryPoint` validation tightened from `startsWith("http")` to `new URL()` parsing, rejecting malformed URLs like `http:evil` or `http//missing-colon`.

  **Refactoring (no API changes):**
  - Extract shared `processSAMLResponse` pipeline to eliminate ~500 lines of duplicated logic between `callbackSSOSAML` and `acsEndpoint`
  - Move `validateSAMLTimestamp` to `saml/timestamp.ts` (re-exported from original location for compatibility)

- Updated dependencies [[`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d), [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649), [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463), [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f), [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656), [`544f1c6`](https://github.com/better-auth/better-auth/commit/544f1c63c9826831d96a126fbe568d8a8a8fde68)]:
  - better-auth@1.7.0-beta.0
  - @better-auth/core@1.7.0-beta.0
- Updated dependencies [[`5142e9c`](https://github.com/better-auth/better-auth/commit/5142e9cec55825eb14da0f14022ae02d3c9dfd45), [`484ce6a`](https://github.com/better-auth/better-auth/commit/484ce6a262c39b9c1be91d37774a2a13de3a5a1f), [`f875897`](https://github.com/better-auth/better-auth/commit/f8758975ae475429d56b34aa6067e304ee973c8f), [`6ce30cf`](https://github.com/better-auth/better-auth/commit/6ce30cf13853619b9022e93bd6ecb956bc32482d), [`f6428d0`](https://github.com/better-auth/better-auth/commit/f6428d02fcabc2e628f39b0e402f1a6eb0602649), [`9a6d475`](https://github.com/better-auth/better-auth/commit/9a6d4759cd4451f0535d53f171bcfc8891c41db7), [`513dabb`](https://github.com/better-auth/better-auth/commit/513dabb132e2c08a5b6d3b7e88dd397fcd66c1af), [`c5066fe`](https://github.com/better-auth/better-auth/commit/c5066fe5d68babf2376cfc63d813de5542eca463), [`5f84335`](https://github.com/better-auth/better-auth/commit/5f84335815d75410320bdfa665a6712d3416b04f)]:
  - better-auth@1.6.3
  - @better-auth/core@1.6.3

## 1.6.2

### Patch Changes

- [#8968](https://github.com/better-auth/better-auth/pull/8968) [`5e5d3f6`](https://github.com/better-auth/better-auth/commit/5e5d3f62fcf457a2717e5ed774122ab0fd39884d) Thanks [@cyphercodes](https://github.com/cyphercodes)! - fix(sso): strip whitespace from SAMLResponse before base64 decoding

  Some SAML IDPs send SAMLResponse with line-wrapped base64 (per RFC 2045), which caused decoding failures. Whitespace is now stripped at the request boundary before any processing.

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

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enable InResponseTo validation by default for SAML flows

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [#8838](https://github.com/better-auth/better-auth/pull/8838) [`ee8b40d`](https://github.com/better-auth/better-auth/commit/ee8b40d502bb392bd56748ac48aadf0e6c71e929) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - pin `samlify` to `~2.10.2` to avoid breaking changes in v2.11.0 and patch transitive `node-forge` vulnerability (4 HIGH CVEs: signature forgery, cert chain bypass, DoS)

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix provisionUser inconsistency between OIDC and SAML and add provisionUserOnEveryLogin option

- Updated dependencies [[`dd537cb`](https://github.com/better-auth/better-auth/commit/dd537cbdeb618abe9e274129f1670d0c03e89ae5), [`bd9bd58`](https://github.com/better-auth/better-auth/commit/bd9bd58f8768b2512f211c98c227148769d533c5), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33), [`469eee6`](https://github.com/better-auth/better-auth/commit/469eee6d846b32a43f36b418868e6a4c916382dc), [`560230f`](https://github.com/better-auth/better-auth/commit/560230f751dfc5d6efc8f7f3f12e5970c9ba09ea)]:
  - better-auth@1.6.0
  - @better-auth/core@1.6.0

## 1.6.0-beta.0

### Minor Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Enable InResponseTo validation by default for SAML flows

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix provisionUser inconsistency between OIDC and SAML and add provisionUserOnEveryLogin option

- Updated dependencies [[`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b), [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b)]:
  - better-auth@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
