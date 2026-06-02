---
"better-auth": patch
---

Restore the normal emailed-invitation flow while documenting the stricter verification posture for organization invitations.

Client-side `listUserInvitations` now always requires a verified session email because it enumerates invitation IDs from `session.user.email`. The `requireEmailVerificationOnInvitation` option now controls recipient calls that carry an invitation ID (`acceptInvitation`, `rejectInvitation`, `getInvitation`). When unset, Better Auth keeps the emailed-invitation sign-up flow for built-in opaque invitation IDs, including the default generator or `advanced.database.generateId: "uuid"`, and requires verified email when invitation IDs are externally controlled or predictable, such as `advanced.database.generateId: "serial"` / `false` or custom ID generation. Apps that expose invitation IDs outside the invited user's mailbox, expose organization invitation lists to members, or require stricter ownership proof should set `requireEmailVerificationOnInvitation: true` or require verified email before sign-in.
