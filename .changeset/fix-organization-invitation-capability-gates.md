---
"better-auth": patch
---

Split organization invitation email-verification policy by trust boundary.

Client-side `listUserInvitations` now always requires a verified session email because it enumerates invitation IDs from `session.user.email`. The `requireEmailVerificationOnInvitation` option now controls only token-bearing recipient calls (`acceptInvitation`, `rejectInvitation`, `getInvitation`) and defaults to `false`, restoring the normal emailed-invitation sign-up flow while keeping the self-enumeration path protected.
