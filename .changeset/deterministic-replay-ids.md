---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Fixed SAML sign-in, DPoP-bound requests, and `private_key_jwt` client authentication for apps that set `advanced.database.generateId: "uuid"`. Default id generation is unaffected.

Depending on the database, these flows failed with a `NOT NULL` error on the `id` column (for example on SQLite and MySQL), or accepted a reused SAML assertion, DPoP proof, or client assertion (for example on Postgres). Each one is now accepted only once. No migration is needed.

Apps that set `generateId: "serial"` now log a warning the first time one of these flows runs, because their single-use checks need string ids.

Plugins that store their own single-use records can use `encodeDeterministicId` from `@better-auth/core/db/adapter` to get an id that the configured `generateId` setting keeps.
