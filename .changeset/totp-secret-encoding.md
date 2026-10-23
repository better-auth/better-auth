---
"better-auth": minor
---

Support Base32-encoded TOTP secrets alongside existing UTF-8 secrets using an optional `secretEncoding` field on each `twoFactor` record. Verification and provisioning URIs respect the stored encoding; missing or null values preserve existing behavior.

Set `totpOptions.secretEncoding` to choose the encoding for new enrollments. It defaults to `"utf8"`.

Generate and apply a schema migration to add the optional `secretEncoding` column. No existing secrets need to be rewritten.
