---
"@better-auth/core": patch
"@better-auth/sso": patch
"@better-auth/test-utils": patch
"better-auth": patch
---

Identify accounts by `(providerId, accountId)` again, as in 1.6, and drop the `issuer` column added in 1.7.0. Upgrading a 1.6 database no longer needs an account data migration.

If you already applied the 1.7.0 through 1.7.2 account schema, resolve duplicate provider keys and relax the column before upgrading. Better Auth no longer writes `account.issuer` and the column was created `NOT NULL`, so sign-ups and account links fail until the constraint is gone. Drop the `NOT NULL` constraint and the `account_issuer_accountId_uidx` index. Dropping the column itself is optional cleanup. `auth migrate` does not do this for you.
