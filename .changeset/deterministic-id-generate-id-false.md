---
"@better-auth/core": patch
---

Magic link and email OTP sign-in for unverified users no longer fail with a malformed ObjectID error on MongoDB setups that use `generateId: false`.
