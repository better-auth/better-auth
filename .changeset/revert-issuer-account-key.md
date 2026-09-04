---
"@better-auth/core": patch
"@better-auth/sso": patch
"@better-auth/test-utils": patch
"better-auth": patch
---

Accounts are recognized by `providerId` and `accountId` again, and the `account` table no longer requires an `issuer` column or a unique `(issuer, accountId)` index, so upgrading from 1.6 needs no account data migration. If you added the `issuer` column on 1.7.0 through 1.7.2, drop the unique index and the column.
