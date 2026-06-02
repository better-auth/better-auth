---
"better-auth": patch
---

Split organization invitation email-verification policy by trust boundary.

Client-side `listUserInvitations` now always requires a verified session email because it enumerates invitation IDs from `session.user.email`. The `requireEmailVerificationOnInvitation` option now controls only recipient calls that carry an invitation ID (`acceptInvitation`, `rejectInvitation`, `getInvitation`). When unset, Better Auth keeps the emailed-invitation sign-up flow for built-in opaque invitation IDs, including the default generator or `advanced.database.generateId: "uuid"`, and requires verified email when invitation IDs are externally controlled or predictable, such as `advanced.database.generateId: "serial"` / `false` or a custom `advanced.generateId` function.
