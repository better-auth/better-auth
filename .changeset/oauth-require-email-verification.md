---
"better-auth": minor
"@better-auth/core": minor
---

Add `requireEmailVerification` to OAuth provider options, for built-in social providers and the Generic OAuth plugin. When a provider reports an unverified email, the user and account are still created or linked, but no session is issued: the OAuth callback redirects with `?error=email_not_verified`, and ID token and One Tap sign-in return `403` `EMAIL_NOT_VERIFIED`. Verification emails follow the existing `emailVerification.sendOnSignUp` / `sendOnSignIn` settings.

It is opt-in per provider and does not inherit `emailAndPassword.requireEmailVerification`, so existing social logins keep working. The gate checks the local user's verification state, so a user verified through another method keeps access. Only enable it for providers that report a trustworthy `email_verified` signal.
