---
"@better-auth/core": patch
"better-auth": patch
---

Expose `user.additionalFields` via `User & Record<string, unknown>` on the `user` param types of `emailVerification`, `emailAndPassword`, `changeEmail`, and `deleteUser` callbacks.
