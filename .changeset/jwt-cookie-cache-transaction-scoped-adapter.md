---
"better-auth": patch
---

Sign-up no longer deadlocks when session cookie caching uses the JWT strategy on a single-connection SQLite database with native transactions enabled. JWKS key lookups and creation now resolve the transaction-scoped adapter instead of always querying the root connection, so minting a signing key during sign-up joins the surrounding transaction instead of racing it for the only available connection. On multi-connection databases (Postgres, MySQL) this also fixes a silent atomicity gap where a JWKS key created mid-transaction could commit independently of the transaction it was minted in.
