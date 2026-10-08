---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Replay protection now works with `advanced.database.generateId: "uuid"`. The single-use marker for a SAML assertion, DPoP proof, or `private_key_jwt` client assertion lost the id derived from the replayed value. On Postgres, replays were accepted; on SQLite and MySQL, these flows failed with a `NOT NULL` error. The derived id is now formatted as a UUID under that setting. Ids under other string settings are unchanged, so no migration is needed.

With `generateId: "serial"`, a numeric id cannot hold the derived id, so these checks now fail with an error instead of accepting every replay. SAML sign-in, DPoP-bound requests that use the database replay store, and `private_key_jwt` client authentication throw. SIWE uses the wallet-derived address instead of the `email` claim. Magic link and email OTP adoption run without the cleanup lock.
