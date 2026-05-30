---
"better-auth": patch
---

Fix Google One Tap signing in the wrong user when the presented Google account is already linked to someone else. One Tap now resolves identity through the shared OAuth path, so the user who owns the Google subject is signed in, matching the redirect and `signIn.social` flows. Previously it matched a local user by the token's email and used the subject only to decide linking, so a Google credential owned by one user could authenticate a different user who happened to share that email.

`/account-info` now resolves the account from the signed-in user's own linked accounts and accepts an optional `providerId` to disambiguate when two providers issue the same account ID. A colliding account ID returns a distinct `AMBIGUOUS_ACCOUNT` error instead of a misleading "not found", and an account with no configured social provider returns a 400 rather than a 500.
