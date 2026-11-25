---
"@better-auth/core": patch
---

`InternalAdapter.createVerificationValue` is now typed as returning `Promise<Verification | null>`. It already resolved to `null` when a `verification.create.before` database hook returned `false`, but the type said it always returned a record.

Plugins that read the result now need to handle `null`. TypeScript reports an error where the result is used without a check, such as `(await createVerificationValue(data)).identifier`.
