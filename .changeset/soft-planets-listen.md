---
"@better-auth/core": patch
---

Expose `user.additionalFields` on the `user` param types of the `emailVerification`, `emailAndPassword`, `changeEmail`, and `deleteUser` callbacks. These callbacks receive the full user record from the database at runtime, but their types previously only included the base `User` fields.
