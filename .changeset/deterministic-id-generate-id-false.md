---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/oauth-provider": patch
---

Magic link and email OTP sign-in for unverified users no longer fail with a malformed ObjectID error when using Prisma on MongoDB with database-generated ids.
