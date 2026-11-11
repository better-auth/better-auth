---
"@better-auth/core": patch
"@better-auth/prisma-adapter": patch
"better-auth": patch
"@better-auth/oauth-provider": patch
---

On Prisma with MongoDB, when your id columns use `@db.ObjectId`, magic link and email OTP sign-in for users with an unverified email no longer fail with a 500 (`Malformed ObjectID`). SAML sign-in, DPoP-bound OAuth requests, and `private_key_jwt` client authentication are fixed the same way, and Sign-In with Ethereum now keeps the email the user supplied instead of a placeholder. Setups with plain `String` id columns and other databases are unaffected.
