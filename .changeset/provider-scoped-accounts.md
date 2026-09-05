---
"better-auth": patch
"@better-auth/core": patch
"auth": patch
"@better-auth/sso": patch
---

Identify accounts by `(providerId, accountId)` again, as in Better Auth 1.6, and drop the `issuer` column introduced in 1.7.0.

If you already applied the 1.7.0 to 1.7.2 account schema, remove the leftover column before upgrading. Better Auth no longer writes `account.issuer`, and the column was created `NOT NULL`, so new sign-ups and account links will fail until it is gone. Drop the `account_issuer_accountId_uidx` unique index, then drop the `issuer` column (or make it nullable). Prisma and Drizzle users should also remove the `issuer` field from their `account` model and regenerate. `auth migrate` does not detect or remove the column for you.
