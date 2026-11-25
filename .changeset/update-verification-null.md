---
"@better-auth/core": patch
---

`InternalAdapter.updateVerificationByIdentifier` is now typed as returning `Promise<Verification | null>`. It already resolved to `null` when a `verification.update.before` database hook returned `false` or no database row matched, but the type said it always returned a record.
