---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
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

The opt-in schema requires nullable `pendingEmail` and private `pendingEmailRequestId` user
columns. Only the latest request can be applied, even for the same address. Cancellation,
and superseding requests are guarded atomically. Public pending state and delivery errors do
not disclose whether another account owns the requested address. Verification does
not create an anonymous login session or replace a different account's session. Earlier preview
links without a request identity are rejected after upgrading; users must request a new link.

Drizzle conditional updates retain mutable guards on the outer UPDATE while selecting at
most one row. PostgreSQL can then recheck those guards after waiting for a concurrent update.

Email change session revocation requires enabled database transactions without secondary storage.
Vetoes and failed session replacement roll back the email, verification token and sessions together.
Cookie caching does not authorize revoked sessions, and pending state is refreshed after changes.

If the target address is claimed before confirmation, the pending request is cleared and its
link consumed without revoking sessions, and the visiting account's cached pending state is refreshed.
A separately declared mutable configuration retains
the optional pending-email user type; an explicitly disabled strategy omits it.
