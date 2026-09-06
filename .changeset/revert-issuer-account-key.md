---
"@better-auth/core": patch
"@better-auth/sso": patch
"@better-auth/test-utils": patch
"better-auth": patch
---

Restore sign-in compatibility with 1.6 databases by identifying accounts with `(providerId, accountId)` and removing the `issuer` requirement introduced in 1.7.0. Upgrading from 1.6 no longer requires an account schema migration. Ambiguous account keys are rejected instead of selecting an arbitrary account.

If you applied the 1.7.0 through 1.7.2 account schema, remove its issuer unique index before upgrading. For SQL databases, also make `issuer` nullable or remove the column so sign-ups and account linking can succeed. `auth migrate` does not perform this cleanup. Follow the [upgrade guide](https://www.better-auth.com/docs/guides/1-7-upgrade-guide) for database-specific steps.
