---
"better-auth": minor
"@better-auth/core": minor
---

Add an opt-in `user.changeEmail.strategy` for the email-change flow.

The default, `"jwt"`, is the existing behavior — nothing changes unless you opt in.

Setting `strategy: "verification-table"` stores the pending change in the verification
table and exposes it as `user.pendingEmail`, so your UI can show which address is awaiting
confirmation. It adds `/cancel-email-change` to discard a pending change, verifies through a
dedicated `/verify-email-change/:userId/:token` endpoint that consumes the token atomically
(so a verification link cannot be replayed), and takes its own
`changeEmail.sendVerificationEmail` callback — separate from
`emailVerification.sendVerificationEmail`, so change-email mails no longer share a template
or a code path with sign-up verification.

Also available under this strategy: `revokeOtherSessions` to sign other devices out once the
change is applied, and `onChangeEmailRequested` / `onChangeEmailCompleted` /
`onChangeEmailCancelled` callbacks.
