---
"better-auth": patch
---

Fixed lost sign-up emails when the database adapter uses transactions and `advanced.backgroundTasks.handler` is set. The verification email, including the `emailOTP` code with `overrideDefaultEmailVerification`, and `onExistingUserSignUp` now run after the sign-up is saved. Before, the OTP was never stored, so new users could not verify.

On every setup, if `sendVerificationEmail` or `onExistingUserSignUp` throws, the sign-up now succeeds and the error is logged. To reject a sign-up, use a `databaseHooks.user.create.before` hook.
