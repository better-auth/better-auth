---
"better-auth": patch
---

Google One Tap now applies your `socialProviders.google.mapProfileToUser` and custom `getUserInfo`, the same as the standard Google sign-in. Before, One Tap ignored both and always stored the token's `name`, `email`, `email_verified`, and `picture` claims.

If you configured either one, users created through One Tap now get the fields it returns, including any extra fields such as a first name from `given_name`. Returning users are updated from it on each One Tap sign-in when `socialProviders.google.overrideUserInfoOnSignIn` is on, and so are existing users that One Tap links when `account.accountLinking.updateUserInfoOnLink` is on. Check that your mapper suits One Tap users too. Setups that configure neither, including `oneTap({ clientId })` with no Google provider, are unaffected.
