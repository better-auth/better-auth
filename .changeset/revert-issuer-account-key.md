---
"@better-auth/core": patch
"@better-auth/sso": patch
"@better-auth/test-utils": patch
"better-auth": patch
---

Identify accounts by `(providerId, accountId)` again, as in 1.6, and drop the `issuer` column added in 1.7.0. Upgrading a 1.6 database no longer needs an account data migration.

If you already applied the 1.7.0 through 1.7.2 account schema, Better Auth keeps working: the first account write detects the leftover `NOT NULL` `issuer` column, keeps filling it, and logs one warning. Relax the column now by dropping its `NOT NULL` constraint and the `account_issuer_accountId_uidx` index; dropping the column itself is optional cleanup. `auth migrate` does not do this for you, and the fallback is a temporary bridge that will be removed in a later release.
