---
"better-auth": patch
---

Minting or reading a JWKS signing key inside an active database transaction now uses the transaction-scoped adapter instead of the root connection. On a single-connection SQLite database with native transactions enabled, this no longer deadlocks, and on Postgres and MySQL the key commits with the surrounding transaction instead of independently of it.
