---
"better-auth": patch
---

If you set `advanced.backgroundTasks.handler` and your database adapter runs transactions (the built-in Kysely connection, MongoDB with `client`, or Prisma or Drizzle with `transaction: true`), email sign-up now keeps the database writes made while sending the verification email or running `onExistingUserSignUp`. Before, those writes failed because the sign-up had already been saved. With `emailOTP({ overrideDefaultEmailVerification: true })`, the code was never stored, so new users could not verify their email.

Both callbacks now run after the new user is saved, on every setup. If either one throws, the sign-up succeeds and the error is logged; before, the sign-up failed. To reject a sign-up, use a `databaseHooks.user.create.before` hook.
