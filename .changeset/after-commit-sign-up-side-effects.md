---
"better-auth": minor
---

On every database adapter, the verification email for an email sign-up, or for a new social or SSO account, is now sent only after the account is saved, and `onExistingUserSignUp` runs after the sign-up request's database work completes. A sign-up that rolls back, or that MongoDB runs again after a write conflict, no longer sends an extra email or an email for an account that doesn't exist.

Check your setup for two changes:

- If `sendVerificationEmail` or `onExistingUserSignUp` throws during a sign-up, the sign-up now succeeds and the error is logged. Before, a callback that threw synchronously failed the sign-up and rolled it back. To reject a sign-up, use a `databaseHooks.user.create.before` hook.
- If a `databaseHooks` `user` or `account` `after` hook throws during a sign-up, the request still fails, but the verification email is no longer sent. The user can request a new one.

With `secondaryStorage` and `session.storeSessionInDatabase: true`, social, SSO, one-tap and oauth-proxy sign-ins now cache their session after the commit, as email sign-up already did. A failed cache write is logged instead of failing the sign-in. This doesn't apply when `session.preserveSessionInDatabase` is `true`, where a failed cache write still fails the sign-in.
