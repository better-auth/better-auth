# better-auth

## 1.6.11

### Patch Changes

- [#9568](https://github.com/better-auth/better-auth/pull/9568) [`0cbddb8`](https://github.com/better-auth/better-auth/commit/0cbddb8fa4eb19fbca75e9822134f89b3604286a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `internalAdapter.consumeVerificationValue(identifier)`: atomically consume a verification row keyed by identifier. The first concurrent caller receives the row; later racers receive `null`. Backed by a new `DBAdapter.consumeOne` primitive implemented natively per adapter (memory, mongo, drizzle, kysely, prisma), with a `transaction(findMany + delete)` factory fallback. `SecondaryStorage.getAndDelete` is added as an optional companion; Redis ships it via an atomic Lua get-and-delete operation for compatibility with Redis versions before 6.2.

- [#9162](https://github.com/better-auth/better-auth/pull/9162) [`a26333b`](https://github.com/better-auth/better-auth/commit/a26333b5fb1a044e76c18385441d3ecc2240ab70) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: cleanup sessions when admin, anonymous, or SCIM deletes a user

- [#9573](https://github.com/better-auth/better-auth/pull/9573) [`99a254a`](https://github.com/better-auth/better-auth/commit/99a254a79b59d5a3f5ca2123260118cddb5beed7) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(device-authorization): require verify-time ownership claim for approve/deny

  Pending device codes were not bound to the user who entered the code on the verification page until approval, leaving a window where any authenticated user could approve or deny another user's pending code by knowing the `user_code`. `GET /device` now claims the pending row for the calling session, and `POST /device/approve` and `POST /device/deny` require the calling session to match the claimed owner. Custom verification pages must be served to an authenticated session for the flow to succeed.

- [#8948](https://github.com/better-auth/better-auth/pull/8948) [`ee93485`](https://github.com/better-auth/better-auth/commit/ee934854999390ee5ca73592fe205a470a810b83) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: add error code to change-email-disabled

- [#9572](https://github.com/better-auth/better-auth/pull/9572) [`5f09d56`](https://github.com/better-auth/better-auth/commit/5f09d566a64ac9a0499d9664ce700edbf0630cea) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix race condition in the `magic-link` plugin's verify handler that allowed two concurrent requests to mint two sessions from the same single-use token. The handler now consumes the verification row atomically via `internalAdapter.consumeVerificationValue`, so a given magic link mints at most one session regardless of concurrency. The `allowedAttempts` option is retained for backward compatibility but no longer multiplies successful redemptions; tokens are single-use. The second-redeem error code changes from `ATTEMPTS_EXCEEDED` to `INVALID_TOKEN` (the token no longer exists after consumption).

- [`b4bc65a`](https://github.com/better-auth/better-auth/commit/b4bc65a007784b2eb0efb459e5fa6fd8055d3ec9) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix race condition in the OAuth authorization-code grant: two concurrent token-exchange requests sharing the same `code` could both pass the find step before either delete completed and each mint an independent access/refresh/id token set. The `authorization_code` handler in `@better-auth/oauth-provider`, plus the legacy `oidc-provider` and `mcp` plugins in `better-auth`, now consume the verification row atomically via `internalAdapter.consumeVerificationValue`. The first caller mints tokens; concurrent racers receive `invalid_grant` (RFC 6749 §5.2). Malformed-verification-value branches in `@better-auth/oauth-provider` previously returned a project-specific `invalid_verification` code; those are now `invalid_grant` so spec-compliant clients can branch on the standard code.

- [#9578](https://github.com/better-auth/better-auth/pull/9578) [`da7e50b`](https://github.com/better-auth/better-auth/commit/da7e50beee849c59a2ed1ec6b3a38cc6ab9fb563) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - `handleOAuthUserInfo` (used by every social provider, generic-oauth, oauth-proxy, SSO OIDC and SAML, and idToken sign-in) implicitly linked a returning OAuth identity into a local user row whenever the IdP's `email_verified` claim was true or the provider was trusted. The local row's own `emailVerified` flag was read only to flip it after linking, never as a precondition. `POST /sign-up/email` creates rows with `emailVerified: false` for any caller, so an attacker who pre-registered a victim's email at the application could wait for the legitimate user's first OAuth sign-in: the IdP's verified claim was treated as ownership proof, and the victim's IdP identity was linked into the attacker-owned row.

  The implicit-link gate now requires `dbUser.user.emailVerified === true` in addition to the provider trust check by default. A new `account.accountLinking.requireLocalEmailVerified` option (default `true`) is the public surface for this gate. Apps whose users sign up via OAuth without verifying their email locally can opt back into the legacy behavior with `account: { accountLinking: { requireLocalEmailVerified: false } }`; understand the takeover risk before doing so. The option is `@deprecated`; a FIXME at each gate site points at the next-minor follow-up on `next` that drops the option and makes the gate unconditional.

  The `one-tap` plugin honored its own copy of the gate and was updated identically: `requireLocalEmailVerified` and `accountLinking.disableImplicitLinking` both apply on `/one-tap/callback`. The `email_verified` claim from the Google ID token is now normalized via `toBoolean` so a string `"false"` is treated as falsy.

  Test fixtures across `admin`, `oidc-provider`, `mcp`, `generic-oauth`, `last-login-method`, and `oauth-provider` suites now mark users `emailVerified: true` via a `databaseHooks.user.create.before` hook (or the `disableTestUser` opt-in on the oauth-provider RP) so the suites continue to exercise their role/flow logic rather than the new gate.

- [#9507](https://github.com/better-auth/better-auth/pull/9507) [`a1c9f3c`](https://github.com/better-auth/better-auth/commit/a1c9f3c08e7398e900e099839aa6dcc8d1d0b816) Thanks [@GautamBytes](https://github.com/GautamBytes)! - Preserve exact access-control role statement types so predefined organization roles expose only their configured permissions in TypeScript.

- [#9577](https://github.com/better-auth/better-auth/pull/9577) [`23094a6`](https://github.com/better-auth/better-auth/commit/23094a628f007f801be6d26e5b15dc5fc6fc4eb8) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The organization plugin's invitation recipient endpoints (`acceptInvitation`, `rejectInvitation`, `getInvitation`, `listUserInvitations`) treated `invitation.email.toLowerCase() === session.user.email.toLowerCase()` as proof that the calling user owned the invited address. A session-authenticated user whose email matched but was never verified passed the gate, so anyone who could pre-register an unverified account at a victim's email could accept invitations addressed to that email. The `requireEmailVerificationOnInvitation` opt-in option closed the gap only when explicitly enabled and did not protect `getInvitation` or `listUserInvitations` at all.

  The gate is now applied on all four recipient endpoints and the `requireEmailVerificationOnInvitation` option default flips from `false` to `true` so existing apps are secure by default. Apps that intentionally accept invitations from unverified accounts can keep the legacy permissive behavior with `organization({ requireEmailVerificationOnInvitation: false })`, but they should understand the takeover risk before doing so. Server-side calls to `listUserInvitations` with `ctx.query.email` and no session continue to bypass the gate (the caller is trusted).

  The option is `@deprecated`. The next-minor release on `next` removes it entirely and makes the gate unconditional.

- [#9548](https://github.com/better-auth/better-auth/pull/9548) [`142b86c`](https://github.com/better-auth/better-auth/commit/142b86c43d2e6b258236a298a31237e97f87d64d) Thanks [@dipan-ck](https://github.com/dipan-ck)! - anonymous plugin now correctly calls onLinkAccount when email verification triggers auto sign-in

- [#9576](https://github.com/better-auth/better-auth/pull/9576) [`1f2ff42`](https://github.com/better-auth/better-auth/commit/1f2ff4215c4affff0b140b0c0a712c0dde35659c) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oidc-provider, mcp): authenticate confidential clients on refresh_token grant and harden secret comparison

  Refresh-token grants on the legacy `oidc-provider` and `mcp` plugins now require the registered `client_secret` from confidential clients, matching the `authorization_code` path. Public clients (where `code_verifier` substitutes for the secret on the auth-code grant) continue to skip secret validation. Secret comparisons across both plugins now use constant-time equality. The `/mcp/token` endpoint no longer emits a wildcard CORS `Access-Control-Allow-Origin: *` header.

  These plugins are deprecated in favor of `@better-auth/oauth-provider`, which is unaffected. New deployments should adopt the replacement; this patch keeps existing deployments protected while migrating.

- [#9575](https://github.com/better-auth/better-auth/pull/9575) [`699b09a`](https://github.com/better-auth/better-auth/commit/699b09a2064dcb7d37046b5a90626c0b6f57af90) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - fix(oidc-provider, mcp): drop `"none"` from advertised signing algorithms, default `allowPlainCodeChallengeMethod` to `false`, and reject missing PKCE method

  The legacy `oidc-provider` and `mcp` plugins now follow OAuth 2.1 (RFC 9700) on three protocol gates:
  - `id_token_signing_alg_values_supported` (oidc-provider, mcp) and `resource_signing_alg_values_supported` (mcp) no longer include `"none"`. Relying parties that negotiate from this list will no longer be steered toward unsigned tokens.
  - `allowPlainCodeChallengeMethod` defaults to `false`. Callers who need `plain` PKCE must opt in explicitly.
  - Under the secure default the authorize endpoint no longer silently rewrites a missing `code_challenge_method` to `"plain"` before the allowlist check. A request that provides `code_challenge` without `code_challenge_method` is now rejected with `invalid_request`; the inverse case (`code_challenge_method` without `code_challenge`) is also rejected so no inconsistent PKCE state is persisted on the authorization code record.

  Non-breaking for callers who never relied on `"none"` advertisement or the plain default. Callers who explicitly set `allowPlainCodeChallengeMethod: true` keep `plain` on the allowlist **and** retain the legacy "missing method defaults to plain" behavior for backward compatibility, so existing integrations that opted into plain PKCE continue to work. The next-minor on `next` will drop both the `plain` allowlist entry and this fallback; until then, the option is the single explicit knob for legacy behavior. Migrate to `@better-auth/oauth-provider` for the canonical, spec-aligned implementation.

- Updated dependencies [[`0cbddb8`](https://github.com/better-auth/better-auth/commit/0cbddb8fa4eb19fbca75e9822134f89b3604286a), [`c6918ec`](https://github.com/better-auth/better-auth/commit/c6918ecc9e3a75892169415d7f6c95b591b6a52d), [`da7e50b`](https://github.com/better-auth/better-auth/commit/da7e50beee849c59a2ed1ec6b3a38cc6ab9fb563), [`b0ef96f`](https://github.com/better-auth/better-auth/commit/b0ef96fd8ec08ebb4d6ad0c0557d4b7855703f10), [`e21d744`](https://github.com/better-auth/better-auth/commit/e21d744987476c20a934c79ef226fe6a5f468e22)]:
  - @better-auth/core@1.6.11
  - @better-auth/drizzle-adapter@1.6.11
  - @better-auth/kysely-adapter@1.6.11
  - @better-auth/memory-adapter@1.6.11
  - @better-auth/mongo-adapter@1.6.11
  - @better-auth/prisma-adapter@1.6.11
  - @better-auth/telemetry@1.6.11

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
