# better-auth

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
