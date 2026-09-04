---
"@better-auth/core": patch
"@better-auth/sso": patch
"@better-auth/test-utils": patch
"better-auth": patch
---

Identify accounts by `(providerId, accountId)` again, as in 1.6, and drop the `issuer` column added in 1.7.0. Upgrading a 1.6 database no longer needs an account data migration.

If you already applied the 1.7.0 to 1.7.2 account schema, remove the column before upgrading. Better Auth no longer writes `account.issuer` and the column was created `NOT NULL`, so sign-ups and account links fail until it is gone. Drop the `account_issuer_accountId_uidx` unique index, then drop the column or make it nullable. Prisma and Drizzle users should also remove the field from their `account` model and regenerate. `auth migrate` does not detect or remove it for you.
