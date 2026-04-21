---
"@better-auth/core": major
"better-auth": major
"@better-auth/passkey": major
"@better-auth/sso": major
---

Introduce a generic sign-in challenge envelope and pause sign-in consistently across every flow that can be gated by 2FA. The legacy flat `twoFactorRedirect` / `challengeId` / `twoFactorMethods` shape has been removed.

Sign-in responses are now one of two shapes: the established session payload on success, or a discriminated envelope when a paused step is required.

```ts
// Session finalized in this request (unchanged from prior releases)
{ redirect, token, url, user }

// Sign-in paused: an additional step is required
{ kind: "challenge", challenge: { kind: "two-factor", attemptId, methods } }
```

Use the exported `isSignInChallenge` and `isSignInChallengeOfKind` guards to detect the paused branch; if neither matches, the request finalized the session. The challenge union is open-ended: plugins can register new challenge kinds by augmenting `BetterAuthSignInChallengeRegistry`, so the envelope shape is stable even as new challenges are introduced.

Affected sign-in flows:

- email/password and username sign-in
- phone-number sign-in and verification
- email OTP sign-in and verification-based auto sign-in
- magic-link verification
- email verification auto sign-in
- social and generic OAuth callback flows
- SSO callback flows
- One Tap sign-in
- passkey authentication
- SIWE verification

Behavioral guarantees:

- No primary session is published until the sign-in step succeeds. Pre-existing signed-in sessions are preserved while another sign-in is paused.
- The paused sign-in is keyed by an explicit `attemptId`. Challenge routes stay scoped to the current session unless the paused attempt is identified. Stale two-factor cookies no longer override active session-scoped 2FA actions.
- Redirect-based sign-in flows now land on the app with `?challenge=two-factor` instead of a flat `twoFactorRedirect=true`. The `attemptId` is deliberately not included: query params leak through `Referer` headers and reverse-proxy access logs. Browsers read the attempt from the signed `better-auth.two_factor_challenge` cookie; native/JSON callers receive it in the response body and send it back as `body.attemptId`.
- Passkey authentication treats UV-verified assertions as complete authentication and only pauses when an additional factor is still required.
- `lastLoginMethod` is written after the sign-in is finalized, including when `storeInDatabase: true` is enabled.

Breaking changes:

- Response shape: paused sign-in now returns `{ kind: "challenge", challenge: { kind, attemptId, methods } }`. Callers should check for the paused branch with `isSignInChallenge` / `isSignInChallengeOfKind`, and read `challenge.attemptId` / `challenge.methods`. The old `twoFactorRedirect`, `challengeId`, and `twoFactorMethods` fields are gone. The success payload (`{ redirect, token, url, user }`) is unchanged.
- Request shape: `/two-factor/send-code` and `/two-factor/verify` now accept `attemptId` in place of `challengeId` when the paused sign-in must be resumed explicitly.
- Redirect query parameters: `twoFactorRedirect=true&challengeId=<id>&twoFactorMethods=<list>` becomes `challenge=two-factor`. `attemptId` is no longer a URL parameter; read it from the signed `better-auth.two_factor_challenge` cookie (browsers) or the response body (native callers).
- Schema/model rename: the paused-sign-in record is now the `signInAttempt` model (previously `signInTransaction`). Internal adapter methods were renamed accordingly (`findSignInAttempt`, etc.). If you manage adapter schemas manually, regenerate and apply your migrations.
- Internal APIs: `completeSignIn` / `completeSignInRedirect` are now `resolveSignIn` / `resolveSignInWithRedirect`. `getTwoFactorRedirectURL` is now `appendSignInChallengeToURL`.
- One Tap integrations should handle the paused-sign-in branch via `onTwoFactorRedirect` or the fallback callback URL query parameters.
- Session observers only update after a real session is finalized, not when sign-in is paused for a challenge.
- `AuthContext` no longer exposes writers. The public surface is reader-only (`getIssuedSession`, `getFinalizedSignIn`, `getSignInAttempt`). Publishers inside the framework reach writers via `writers(ctx)` from `@better-auth/core/context/internals`. Plugins and integrations that previously touched `ctx.context.setNewSession` / `setFinalizedSignIn` / `setSignInAttempt` (or the backing `newSession` / `finalizedSignIn` / `signInAttempt` slots) now get a TypeScript error: use the matching reader instead, or, for first-party flows that need to publish a session, call `setSessionCookie`. `getNewSession` / `setNewSession` / the `newSession` slot have been renamed to `getIssuedSession` / `setIssuedSession` / `issuedSession` so the name describes the lifecycle event (a session was issued) rather than the temporal freshness of the object.
- `AuthContext.successFinalizers` / `addSuccessFinalizer` are removed. Sign-in cookie commits are now carried on `FinalizedSignIn.commit` (a pre-bound closure) and the dispatcher awaits it once the handler returns; durable side-effects tied to a confirmed sign-in (trusted-device rotation, post-success cookie stamps) register via `finalizeSignIn({ onSuccess })` and fire only after after-hooks accept the request, so they never need a paired rollback.
- `SignInResolution` and `SignInChallenge` both discriminate on `kind` (previously `type` on both levels). Update narrowing sites: `result.type === "session"` becomes `result.kind === "session"`, and `result.challenge.type === "two-factor"` becomes `result.challenge.kind === "two-factor"`. The `isSignInChallengeOfType` guard has been renamed to `isSignInChallengeOfKind`. `type` stayed reserved for payload metadata and ambiguous with the discriminator; standardizing on `kind` at both levels removes the `result.type` vs `result.challenge.type` footgun while keeping the plugin extension point (`BetterAuthSignInChallengeRegistry`) intact.
- Remember-me flag is now stored and read as a positive `rememberMe: boolean`. The internal `dontRememberMe` fields (on `createSession`, the sign-in attempt schema, and the `signInAttempt` table) have been renamed to `rememberMe` with inverted semantics: `dontRememberMe === true` is now `rememberMe === false`, and `undefined` still defaults to "remember". Regenerate and apply your adapter migrations.
- The `dont_remember` cookie is now `session_only` (emitted as `better-auth.session_only`). The `AuthCookies.dontRememberToken` field is now `AuthCookies.sessionOnlyToken`. If you override cookie names via `advanced.cookies`, update any `dont_remember` overrides to `session_only`.
- Two-factor resolver discriminants: `TwoFactorResolver` now uses `mode: "finalize"` (previously `"complete"`) for paused sign-in finalization and `mode: "session"` (previously `"management"`) for step-up / enrollment. The exported types are `FinalizeResolver` and `SessionResolver` (previously `CompleteResolver` and `ManagementResolver`). Custom two-factor providers must update their `resolver.mode` checks.
- Trusted-device cookie identifier is now `trusted_device` (previously `trust_device`), emitted as `better-auth.trusted_device`. Internal helpers `writeTrustDeviceCookie` / `TRUST_DEVICE_COOKIE_*` have been renamed to `writeTrustedDeviceCookie` / `TRUSTED_DEVICE_COOKIE_*`.
- Renamed internal helpers on the finalized-sign-in pipeline: `isSuccessfulAuthFinalization` is now `didSignInSucceed` (past-tense predicate), and `rollBackFinalizedSignIn` is now `rollbackFinalizedSignIn` (single word, consistent with `commitFinalizedSignIn`).
- `appendSignInChallengeToURL` parameter `target` is now `redirectTarget` to disambiguate it from the challenge target.
