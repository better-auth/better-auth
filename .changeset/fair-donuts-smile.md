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
{ type: "challenge", challenge: { type: "two-factor", attemptId, availableMethods } }
```

Use the exported `isSignInChallenge` and `isSignInChallengeOfType` guards to detect the paused branch; if neither matches, the request finalized the session. The challenge union is open-ended: plugins can register new challenge kinds by augmenting `BetterAuthSignInChallengeRegistry`, so the envelope shape is stable even as new challenges are introduced.

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
- Redirect-based sign-in flows now land on the app with `?challenge=two-factor&attemptId=<id>&methods=<list>` instead of a flat `twoFactorRedirect=true`.
- Passkey authentication treats UV-verified assertions as complete authentication and only pauses when an additional factor is still required.
- `lastLoginMethod` is written after the sign-in is finalized, including when `storeInDatabase: true` is enabled.

Breaking changes:

- Response shape: paused sign-in now returns `{ type: "challenge", challenge: { type, attemptId, availableMethods } }`. Callers should check for the paused branch with `isSignInChallenge` / `isSignInChallengeOfType`, and read `challenge.attemptId` / `challenge.availableMethods`. The old `twoFactorRedirect`, `challengeId`, and `twoFactorMethods` fields are gone. The success payload (`{ redirect, token, url, user }`) is unchanged.
- Request shape: `/two-factor/send-otp`, `/two-factor/verify-otp`, `/two-factor/verify-totp`, and `/two-factor/verify-backup-code` now accept `attemptId` in place of `challengeId`.
- Redirect query parameters: `twoFactorRedirect=true&challengeId=<id>&twoFactorMethods=<list>` becomes `challenge=two-factor&attemptId=<id>&methods=<list>`.
- Schema/model rename: the paused-sign-in record is now the `signInAttempt` model (previously `signInTransaction`). Internal adapter methods were renamed accordingly (`findSignInAttempt`, etc.). If you manage adapter schemas manually, regenerate and apply your migrations.
- Internal APIs: `completeSignIn` / `completeSignInRedirect` are now `resolveSignIn` / `resolveSignInWithRedirect`. `getTwoFactorRedirectURL` is now `appendSignInChallengeToURL`.
- One Tap integrations should handle the paused-sign-in branch via `onTwoFactorRedirect` or the fallback callback URL query parameters.
- Session observers only update after a real session is finalized, not when sign-in is paused for a challenge.
