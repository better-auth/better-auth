# better-auth

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

### Patch Changes

- [#9813](https://github.com/better-auth/better-auth/pull/9813) [`d3919dc`](https://github.com/better-auth/better-auth/commit/d3919dc1a560625d8f09161d64701e257452940f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Support server-side `accountInfo` calls without session headers.

  `auth.api.accountInfo` now accepts an optional `userId`, so a trusted server-side caller can read a user's provider profile without constructing session headers. This mirrors `getAccessToken` and `refreshToken`. HTTP callers still require a valid session, and a session always takes precedence over a supplied `userId`.

  The shared "resolve the target user, then fetch a valid access token" logic behind these three endpoints now lives in one place. As part of that, a server-side call that supplies neither a session nor a `userId` reports `USER_ID_OR_SESSION_REQUIRED` (400) consistently, rather than `UNAUTHORIZED` on some endpoints.

- [#9591](https://github.com/better-auth/better-auth/pull/9591) [`5f282bd`](https://github.com/better-auth/better-auth/commit/5f282bd382d694f6834b1d0f8f694f737f223811) Thanks [@Vishesh-Verma-07](https://github.com/Vishesh-Verma-07)! - When only `secondaryStorage` is configured (no primary database), `storeStateStrategy` now defaults to `"database"` instead of `"cookie"`, preventing oversized-cookie errors on platforms like AWS Lambda. The account cookie that holds OAuth tokens in database-less setups stays enabled, so `getAccessToken` keeps working.

- [#9818](https://github.com/better-auth/better-auth/pull/9818) [`43c08a2`](https://github.com/better-auth/better-auth/commit/43c08a2bc77eb01d59ecac28379d5971af6beddc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix two buggy `internalAdapter` helpers.

  Remove `findAccount(accountId)`. It looked accounts up by account ID alone, which is unique neither across providers nor across users, so it returned a non-deterministic match. All callers now use a user-scoped or provider-scoped lookup.

  Replace the ambiguous `deleteSessions(string | string[])` with two explicit methods. `deleteUserSessions(userId)` revokes every session for a user, and `deleteSessions(tokens)` revokes sessions by token. The old single-string overload silently treated its argument as a user ID, so a caller that meant to delete one session token could instead wipe all of a user's sessions or quietly match nothing.

- [#9818](https://github.com/better-auth/better-auth/pull/9818) [`43c08a2`](https://github.com/better-auth/better-auth/commit/43c08a2bc77eb01d59ecac28379d5971af6beddc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix Google One Tap signing in the wrong user when the presented Google account is already linked to someone else. One Tap now resolves identity through the shared OAuth path, so the user who owns the Google subject is signed in, matching the redirect and `signIn.social` flows. Previously it matched a local user by the token's email and used the subject only to decide linking, so a Google credential owned by one user could authenticate a different user who happened to share that email.

  `/account-info` now resolves the account from the signed-in user's own linked accounts and accepts an optional `providerId` to disambiguate when two providers issue the same account ID. A colliding account ID returns a distinct `AMBIGUOUS_ACCOUNT` error instead of a misleading "not found", and an account with no configured social provider returns a 400 rather than a 500.

- [#9838](https://github.com/better-auth/better-auth/pull/9838) [`be32012`](https://github.com/better-auth/better-auth/commit/be32012ca3507a62371d1baa09cdacd5123a99bf) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Validate the scheme of OAuth `redirect_uris` in the `oidc-provider` and `mcp` plugins.

  Both plugins previously accepted any string as a `redirect_uri` at registration. They now reject the `javascript:`, `data:`, and `vbscript:` schemes, which are never valid OAuth redirect targets. The `@better-auth/oauth-provider` package already applied this check, so this change brings the two older plugins in line with it.

  The redirect-URI scheme policy now lives in `@better-auth/core` as a single `SafeUrlSchema` and an `isSafeUrlScheme` helper, and the OAuth provider plugins share that one implementation. The client navigation helpers (`redirectPlugin`, one-tap, and two-factor) also skip navigation when the target uses one of these schemes.

  The change is non-breaking. The `http`, `https`, loopback, and custom application schemes still register unchanged. Both `oidc-provider` and `mcp` are on the migration path to `@better-auth/oauth-provider`, which remains the route to its stricter HTTPS-or-loopback policy.

- [#9842](https://github.com/better-auth/better-auth/pull/9842) [`87c1a0c`](https://github.com/better-auth/better-auth/commit/87c1a0cab274b574592922ccc2454b0bd510a81f) Thanks [@bytaesu](https://github.com/bytaesu)! - You can now clear an organization's logo by passing `logo: null` to `createOrganization` and `updateOrganization`. Previously only a string was accepted, so an existing logo could not be removed.

- [#9822](https://github.com/better-auth/better-auth/pull/9822) [`9c8ded6`](https://github.com/better-auth/better-auth/commit/9c8ded67b192997b6c02150c3423bbc99d9bdb6b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Document `viewBackupCodes` as a server-only function so its API comment no longer reads like an HTTP route.

  The JSDoc above `auth.api.viewBackupCodes` advertised `POST /two-factor/view-backup-codes`, but the endpoint is server-only: it is not registered on the HTTP router and has no client method. The comment now states that it is callable only from trusted server code and that the `userId` should come from an authenticated session.

- [#8758](https://github.com/better-auth/better-auth/pull/8758) [`23d7cbf`](https://github.com/better-auth/better-auth/commit/23d7cbfa793ca69b733f98334bd12962cad61646) Thanks [@bytaesu](https://github.com/bytaesu)! - Apply `accountLinking.updateUserInfoOnLink` across every OAuth link flow.

  Enabling `updateUserInfoOnLink` only synced the user's profile when linking through a direct ID token. Linking through the standard OAuth redirect (`linkSocial`, the generic OAuth `oauth2.link` endpoint, and implicit linking on social sign-in) ignored the option, so the name and image never changed. Every link path now honors it.

  The synced fields match the sign-up path: `name`, `image`, and any fields your `mapProfileToUser` adds. The local `email` and `emailVerified` are never changed on a link, so linking a provider cannot rebind the account's identity.

  Implicit linking on social sign-in also returned the pre-update user, so the freshly issued session served stale profile data from its cookie cache until the cache expired. The new session now carries the updated profile.

- Updated dependencies [[`43c08a2`](https://github.com/better-auth/better-auth/commit/43c08a2bc77eb01d59ecac28379d5971af6beddc), [`5c3e248`](https://github.com/better-auth/better-auth/commit/5c3e248cbf4f81c2cb540b545baa4a5e69d3b066)]:
  - @better-auth/core@1.6.13
  - @better-auth/drizzle-adapter@1.6.13
  - @better-auth/kysely-adapter@1.6.13
  - @better-auth/memory-adapter@1.6.13
  - @better-auth/mongo-adapter@1.6.13
  - @better-auth/prisma-adapter@1.6.13
  - @better-auth/telemetry@1.6.13

## 1.6.12

### Patch Changes

- [#9603](https://github.com/better-auth/better-auth/pull/9603) [`9bd53e1`](https://github.com/better-auth/better-auth/commit/9bd53e191cda174c202a07b6d27af73300e6b175) Thanks [@bytaesu](https://github.com/bytaesu)! - `role.authorize` now treats empty action lists (`[]` or `{ actions: [] }`) as unauthorized, and evaluates each requested resource under the `OR` connector before returning the result.

- [#9702](https://github.com/better-auth/better-auth/pull/9702) [`23dbe1a`](https://github.com/better-auth/better-auth/commit/23dbe1ad0eb79372a674bc0771990c6cc3272a92) Thanks [@bytaesu](https://github.com/bytaesu)! - Banned users signing in with an OAuth provider now redirect to the `errorCallbackURL` passed to `signIn.social`, with `?error=BANNED_USER&error_description=<message>` in the query string. Previously the redirect went to the auth server's default error page with `?error=banned`, which broke multi-domain deployments where the auth host and frontend host differ. The `oauth-proxy`, SSO OIDC, and SAML callbacks now also redirect hook rejections to the error URL (previously returned JSON 403), and `oauth-proxy` URL-encodes the `error` query value across all its redirects.

- [#9596](https://github.com/better-auth/better-auth/pull/9596) [`7a12072`](https://github.com/better-auth/better-auth/commit/7a120724c5c3fdd9d60d59169b32d693e9497fec) Thanks [@bytaesu](https://github.com/bytaesu)! - Email OTP sign-in no longer fails with a missing-captcha-token error under the default captcha settings. If you intentionally want captcha on email OTP sign-in, add `/sign-in/email-otp` to `captcha({ endpoints })`.

- [#9614](https://github.com/better-auth/better-auth/pull/9614) [`09a1d50`](https://github.com/better-auth/better-auth/commit/09a1d50a806f1599707ef4e7c47f8a4b8eb20f96) Thanks [@bytaesu](https://github.com/bytaesu)! - `changeEmail` no longer silently returns `{ status: true }` when the flow cannot complete: if `emailVerification.sendVerificationEmail` is missing for a verified user, the request now fails with a 400 error. `callbackURL` values are also URL-encoded, so callbacks that carry their own query string survive the round trip through verify-email links.

- [#9617](https://github.com/better-auth/better-auth/pull/9617) [`a6f144a`](https://github.com/better-auth/better-auth/commit/a6f144ad0a8ef702969cf49c999ccd073eb1ffa6) Thanks [@bytaesu](https://github.com/bytaesu)! - `parseJSON` now decodes escape sequences such as `\n`, `\\`, and `\uXXXX` in quoted strings. Values such as organization metadata that round-trip through `JSON.stringify` and back no longer come out with raw escape characters in place of the original characters.

- [#9624](https://github.com/better-auth/better-auth/pull/9624) [`f77060a`](https://github.com/better-auth/better-auth/commit/f77060af3a9d1f19f05a26ccf6e56d79bb9db69d) Thanks [@bytaesu](https://github.com/bytaesu)! - Expired magic-link tokens and OAuth authorization codes are now reliably rejected. Magic-link verify redirects to `?error=INVALID_TOKEN` for expired tokens (was `?error=EXPIRED_TOKEN`). The OIDC, MCP, and `@better-auth/oauth-provider` `/token` endpoints return `error_description: "invalid code"` for expired codes (was `"code expired"`). The OAuth `error` value stays `invalid_grant`.

- [#9631](https://github.com/better-auth/better-auth/pull/9631) [`dcb2e6d`](https://github.com/better-auth/better-auth/commit/dcb2e6d29cf4c986ff8980dab50bcfcb8110a749) Thanks [@bytaesu](https://github.com/bytaesu)! - Cookie values containing characters outside the bare cookie-octet range (such as `;`, `"`, or `\`) are now percent-encoded into the `Cookie` header. They were previously dropped on re-serialization, which could break flows that store structured values in cookies.

- [#9792](https://github.com/better-auth/better-auth/pull/9792) [`c92cd74`](https://github.com/better-auth/better-auth/commit/c92cd74162cd1750404ab1da10d3fc20ed7d5e04) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - URL-encode `callbackURL` in the verify-email links sent during OAuth account linking and username sign-in.

  Both paths interpolated the caller's `callbackURL` into the verification link without encoding it. A legitimate value containing an ampersand, such as `/welcome?ref=oauth&plan=pro`, was truncated at the first `&`, so the user landed on the wrong page after verifying their email. The value is now encoded the same way the other verify-email links already handle it.

- [#9642](https://github.com/better-auth/better-auth/pull/9642) [`f5fcc9d`](https://github.com/better-auth/better-auth/commit/f5fcc9d37f2c46d3719a70c18857d9913ce172cf) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(admin): export AdminClientOptions and OrganizationClientOptions

- [#9691](https://github.com/better-auth/better-auth/pull/9691) [`9d91eb7`](https://github.com/better-auth/better-auth/commit/9d91eb77f5c10779b287f9c8de0495fcb75a425a) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: getMigration field index order

- [#9543](https://github.com/better-auth/better-auth/pull/9543) [`1b40dac`](https://github.com/better-auth/better-auth/commit/1b40dac22e0cfddbbb27136fe8067aba154ca91a) Thanks [@bytaesu](https://github.com/bytaesu)! - `Cookie` headers without a space after `;` separators are now tolerated. Signed-in users behind proxies that strip this space were previously treated as logged-out.

- [#9667](https://github.com/better-auth/better-auth/pull/9667) [`5626e1b`](https://github.com/better-auth/better-auth/commit/5626e1b4375aef7735e4f1103035377cbfad755c) Thanks [@kgarg2468](https://github.com/kgarg2468)! - Forward cookie refresh headers emitted while resolving sessions through getSessionFromCtx.

- [#9619](https://github.com/better-auth/better-auth/pull/9619) [`ad9ad82`](https://github.com/better-auth/better-auth/commit/ad9ad824965cb8385f6f2a921576f2cc58ac2b47) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(email-verification): clone request before passing to sendVerificationEmail callback

- [#9661](https://github.com/better-auth/better-auth/pull/9661) [`62dabf6`](https://github.com/better-auth/better-auth/commit/62dabf66780a3dc7270e419886a15c43f3c8d879) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Harden URL normalization and Stripe customer search escaping. URL helpers now trim trailing slashes without a regular expression, and Stripe search query values escape backslashes before quotes.

- [#9347](https://github.com/better-auth/better-auth/pull/9347) [`276d67f`](https://github.com/better-auth/better-auth/commit/276d67fad597ca415a023c10fb5e1165093eebd1) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix: build synthetic user safely without including extra fields

- [#9644](https://github.com/better-auth/better-auth/pull/9644) [`2d73fff`](https://github.com/better-auth/better-auth/commit/2d73ffff4470664147e7207336442029c35f12d9) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(core): respect dynamic baseURL protocol option in getTrustedOrigins

- [#9799](https://github.com/better-auth/better-auth/pull/9799) [`c5b9f93`](https://github.com/better-auth/better-auth/commit/c5b9f93498489888f543e1aa1fc07aae26f73a7f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Refresh access tokens from `genericOAuth` providers that omit `expires_in`.

  When a provider's token response leaves out `expires_in`, Better Auth recorded no expiry, so `getAccessToken` couldn't tell the token had lapsed and never refreshed it; callers kept receiving a stale token. Set `accessTokenExpiresIn` (seconds) on a `genericOAuth` config entry to declare the token's lifetime; the expiry is then synthesized at sign-in and on refresh, and the existing refresh path works. The option is opt-in: providers that return `expires_in` or issue non-expiring tokens are unaffected.

- [#9788](https://github.com/better-auth/better-auth/pull/9788) [`ac96316`](https://github.com/better-auth/better-auth/commit/ac96316af3070ba52c9492464305d3206aadc602) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Surface specific OAuth callback error codes and route every callback failure through one redirect helper.

  A failed OAuth sign-in previously gave users almost nothing to act on. The state parser collapsed every failure into a single `please_restart_the_process` code, and the built-in social callback's missing-state branch redirected with a `state` query parameter the error page never reads, so that case showed no error at all. Now `parseState` forwards the precise `StateError` code (`state_not_found`, `state_invalid`, `state_mismatch`, with `state_security_mismatch` reported as `state_mismatch`), and unexpected failures map to `internal_server_error`.

  The built-in social callback no longer keeps its own missing-state guard; it goes through the shared state parser like every other callback, so both built-in and generic-OAuth providers report a missing `state` as `error=state_not_found`. All callback error redirects (built-in, generic-OAuth, and oauth-proxy) now use one `redirectOnError` helper that owns the query separator, parameter name, and URL encoding, so a redirect cannot be built with the wrong parameter again.

  The `please_restart_the_process` error code is removed. Error pages that branch on `error=please_restart_the_process` should handle the specific state codes (`state_not_found`, `state_invalid`, `state_mismatch`) or `internal_server_error` instead.

- [#9789](https://github.com/better-auth/better-auth/pull/9789) [`0a7cb70`](https://github.com/better-auth/better-auth/commit/0a7cb7064723d2096e36f44b86c59f7181a8e0c5) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Honor the per-flow `errorCallbackURL` when OAuth state validation fails.

  A social sign-in that passed `errorCallbackURL` was still redirected to the default error page (`onAPIError.errorURL` or `/api/auth/error`) when the callback's state check failed, instead of the URL the caller specified. This broke native flows (such as Expo) that need to land on their own error route rather than a backend page.

  The callback now recovers the `errorCallbackURL` from the parsed state and redirects there on a state mismatch. Recovery only applies when the state was parsed before the failure (a nonce or state-cookie mismatch, or an expired request); failures where nothing could be parsed still fall back to the default. The recovered URL needs no new allowlist because `errorCallbackURL` is already validated against `trustedOrigins` at sign-in.

- [#9723](https://github.com/better-auth/better-auth/pull/9723) [`015f96b`](https://github.com/better-auth/better-auth/commit/015f96bc63a90c06a67fbaf80e286b6f6fe1967d) Thanks [@bytaesu](https://github.com/bytaesu)! - The `oauth-proxy` callback now forwards `result.error` from `handleOAuthUserInfo` as the `?error=` query value (e.g. `?error=signup_disabled`) instead of collapsing every error into a generic `?error=user_creation_failed`. Matches the behavior of the core OAuth callback and generic-oauth. The `user_creation_failed` value is still used as a fallback when `result.data` is missing without an explicit error.

- [#9721](https://github.com/better-auth/better-auth/pull/9721) [`43cc49c`](https://github.com/better-auth/better-auth/commit/43cc49c640c0d2c27572807a291d318bbcadfd04) Thanks [@bytaesu](https://github.com/bytaesu)! - Generated OpenAPI schema is now valid for endpoints that expose multiple HTTP methods, such as `/get-session`. Previously these endpoints emitted duplicate `operationId`s and shared response object references, producing schemas that some OpenAPI validators and client generators rejected.

- [#9630](https://github.com/better-auth/better-auth/pull/9630) [`f5e29ea`](https://github.com/better-auth/better-auth/commit/f5e29eaf1e57d73a024d12b1bedf4162e5f4a863) Thanks [@bytaesu](https://github.com/bytaesu)! - `deleteOrganization` and `removeMember` now roll back instead of leaving orphan rows when a step fails.

- [#9616](https://github.com/better-auth/better-auth/pull/9616) [`1d372bb`](https://github.com/better-auth/better-auth/commit/1d372bbab9117f5a574ecb608b7a5108f1ccbc66) Thanks [@bytaesu](https://github.com/bytaesu)! - Organization invitations no longer silently route an invitee to the wrong team when `advanced.database.generateId` returns team ids containing a comma. The invitation API now rejects such ids with an `INVALID_TEAM_ID` error.

- [#8817](https://github.com/better-auth/better-auth/pull/8817) [`3f8f310`](https://github.com/better-auth/better-auth/commit/3f8f310a0f2737f65bb4393eefd6b9372b2cb00e) Thanks [@cyphercodes](https://github.com/cyphercodes)! - Preserve the real session expiry when refreshing the stateless session cookie cache.

- [#9385](https://github.com/better-auth/better-auth/pull/9385) [`17cd433`](https://github.com/better-auth/better-auth/commit/17cd433c66a6ed323b9fda7d4e7db5ad98d8099b) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - Fix OAuth proxy flows that failed with `state_mismatch` when production and preview use different `BETTER_AUTH_SECRET` values.

  Two issues are addressed. The proxy callback's state cleanup now skips the state-cookie check, which could not be satisfied at the bounced cross-origin hop and left the verification record uncleaned. And with the cookie state strategy, the `oauth_state` cookie (encrypted with the local environment secret) is now re-encrypted with the proxy key before it is handed to production, mirroring the database strategy; previously a dedicated proxy `secret` that differed from `BETTER_AUTH_SECRET` broke cookie-strategy proxy flows because production could not decrypt the inner state.

- [#9639](https://github.com/better-auth/better-auth/pull/9639) [`c01b2f1`](https://github.com/better-auth/better-auth/commit/c01b2f13216463fc0fc0054b5acdb9559d29d825) Thanks [@Paola3stefania](https://github.com/Paola3stefania)! - Fix session cookie leak on 2FA-required sign-in. The credential handler wrote valid `session_token` / `session_data` cookies that the 2FA after-hook only appended expiring overrides to; raw-response readers could capture the valid values and replay them to bypass 2FA when `session.cookieCache.enabled`. `expireCookie` now scrubs prior matching `Set-Cookie` entries (including chunks) before re-setting. `/two-factor/disable` switched to `sensitiveSessionMiddleware` as defense in depth.

- [#9464](https://github.com/better-auth/better-auth/pull/9464) [`6b44606`](https://github.com/better-auth/better-auth/commit/6b44606b7d596527b59176b7a0cd06ea66df9031) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - fix(username): validate username on admin `createUser` endpoint

- [#9683](https://github.com/better-auth/better-auth/pull/9683) [`04303a9`](https://github.com/better-auth/better-auth/commit/04303a92acd6fd3cf9d5f5ab5901255e67526ad3) Thanks [@yb175](https://github.com/yb175)! - Widen Kysely peer dependency ranges to support both 0.28.x and 0.29.x.

- [#9791](https://github.com/better-auth/better-auth/pull/9791) [`2b7937f`](https://github.com/better-auth/better-auth/commit/2b7937fc2febd048bfc14b8226287b55b7d48e52) Thanks [@bytaesu](https://github.com/bytaesu)! - Email and password hashing on Cloudflare Workers (`nodejs_compat`) now uses the `node:crypto` implementation instead of the pure-JS fallback.

- Updated dependencies [[`a3b0c63`](https://github.com/better-auth/better-auth/commit/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3), [`85ca603`](https://github.com/better-auth/better-auth/commit/85ca603eecaafa21d4950288b4d58d95c1b5b0b4), [`160d132`](https://github.com/better-auth/better-auth/commit/160d132752b2e540cea8f9c2d2c57307b96867a4), [`5190c26`](https://github.com/better-auth/better-auth/commit/5190c2658f0827b533e7006e95587317ea8cb0cc), [`c5b9f93`](https://github.com/better-auth/better-auth/commit/c5b9f93498489888f543e1aa1fc07aae26f73a7f), [`83fa369`](https://github.com/better-auth/better-auth/commit/83fa3695e7cc0083ff8531f3a2b4101a2e56deff), [`04303a9`](https://github.com/better-auth/better-auth/commit/04303a92acd6fd3cf9d5f5ab5901255e67526ad3), [`7bf5449`](https://github.com/better-auth/better-auth/commit/7bf5449b11866bd82deafee910619660c153d799)]:
  - @better-auth/core@1.6.12
  - @better-auth/drizzle-adapter@1.6.12
  - @better-auth/kysely-adapter@1.6.12
  - @better-auth/memory-adapter@1.6.12
  - @better-auth/mongo-adapter@1.6.12
  - @better-auth/prisma-adapter@1.6.12
  - @better-auth/telemetry@1.6.12

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
