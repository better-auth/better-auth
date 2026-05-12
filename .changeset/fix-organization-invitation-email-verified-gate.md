---
"better-auth": patch
---

The organization plugin's invitation recipient endpoints (`acceptInvitation`, `rejectInvitation`, `getInvitation`, `listUserInvitations`) treated `invitation.email.toLowerCase() === session.user.email.toLowerCase()` as proof that the calling user owned the invited address. A session-authenticated user whose email matched but was never verified passed the gate, so anyone who could pre-register an unverified account at a victim's email could accept invitations addressed to that email. The `requireEmailVerificationOnInvitation` opt-in option closed the gap only when explicitly enabled and did not protect `getInvitation` or `listUserInvitations` at all.

The gate is now applied on all four recipient endpoints and the `requireEmailVerificationOnInvitation` option default flips from `false` to `true` so existing apps are secure by default. Apps that intentionally accept invitations from unverified accounts can keep the legacy permissive behavior with `organization({ requireEmailVerificationOnInvitation: false })`, but they should understand the takeover risk before doing so. Server-side calls to `listUserInvitations` with `ctx.query.email` and no session continue to bypass the gate (the caller is trusted).

The option is `@deprecated`. The next-minor release on `next` removes it entirely and makes the gate unconditional.
