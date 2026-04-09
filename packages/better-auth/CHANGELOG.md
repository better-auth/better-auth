# better-auth

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
