---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/oauth-provider": patch
---

Fixed a 500 error on Prisma with MongoDB when the id column is an ObjectId, that is, when `advanced.database.generateId` is `false` or a function that returns ObjectId strings. Magic link and email OTP sign-in for users whose email is not yet verified failed with `Malformed ObjectID`, and so did SAML sign-in, DPoP-bound OAuth requests, and `private_key_jwt` client authentication. Sign-in with Ethereum fell back to a placeholder email instead of the one the user supplied. These flows now work. Other Prisma with MongoDB setups and other databases are unaffected.
