---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Fixed single-use checks for apps that set `advanced.database.generateId: "uuid"`. Default id generation is unaffected, and no migration is needed.

- On SQLite and MySQL, SAML sign-in, DPoP-bound requests checked against the database replay store, `private_key_jwt` client authentication, and magic link or email OTP sign-ins that adopt an unverified account failed with a `NOT NULL` error on the `id` column. They now work. SIWE sign-in ignored the `email` field and used the wallet-derived address; it now uses the supplied email when no other account has it.
- On Postgres and MongoDB, a reused SAML assertion, DPoP proof, or client assertion was accepted. Each one is now accepted only once.

With `generateId: "serial"`, behavior is unchanged: these checks need string ids, and Better Auth now logs a warning the first time one of these flows runs.
