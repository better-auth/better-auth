---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/oauth-provider": patch
---

On Prisma with MongoDB, when `advanced.database.generateId` is `false` or returns ObjectId strings, magic link and email OTP sign-in for users with an unverified email no longer fail with a 500 (`Malformed ObjectID`). SAML sign-in, DPoP-bound OAuth requests, and `private_key_jwt` client authentication are fixed the same way, and Sign-In with Ethereum now keeps the email the user supplied instead of a placeholder.

If you pair an ObjectId generator with a plain `String` id column, an assertion or proof used just before the upgrade can be accepted once more until it expires. Other setups are unaffected.
