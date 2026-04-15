---
"better-auth": patch
"@better-auth/passkey": patch
---

fix(two-factor): identity-aware session guard, passkey user-verification exemption, and `shouldEnforce` option

The 2FA after-hook previously skipped the challenge whenever `ctx.context.session` was set, regardless of whose session it was. A before-hook that populated `ctx.context.session` with a session for a different user than the one being authenticated could suppress the challenge. The guard now compares the user on `ctx.context.session` against the user on `ctx.context.newSession` and only exits on same-user rewrites, preserving session-refresh and `updateUser` behavior.

The after-hook no longer matches `/admin/impersonate-user`, `/admin/stop-impersonating`, or `/multi-session/*`. Those endpoints operate on already-authenticated identities, not sign-in events, and were being challenged with 2FA that the operator could not produce.

The passkey plugin now signals user verification on `ctx.context.passkeyUserVerified` when the assertion confirmed UV, and the 2FA hook skips the challenge for those sign-ins. Passkey assertions without user verification are still challenged. A UV-verified passkey is a complete MFA event on its own, so a second factor is not required.

A new `TwoFactorOptions.shouldEnforce(ctx) => boolean | Promise<boolean>` option overrides the built-in decision. Return `true` to challenge, `false` to skip. Setting this option replaces the default logic, including the passkey-UV exemption; same-user session rewrites and session-transition endpoints remain non-negotiable. Use it to trust upstream provider MFA on OAuth and SSO callbacks, force a challenge on every sign-in, or branch on request context.
