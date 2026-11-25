---
"@better-auth/core": patch
---

`InternalAdapter.updateVerificationByIdentifier` is now typed as returning `Promise<Verification | null>`. It resolves to `null` when a `verification.update.before` database hook returns `false` or when no value is stored for the identifier. Before, the type said it always returned a record, and with secondary storage only it returned the update input even when nothing was stored.
