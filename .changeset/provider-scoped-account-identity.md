---
"@better-auth/core": patch
"@better-auth/sso": patch
"auth": patch
"better-auth": patch
---

The CLI now generates `account: { identityScope: "provider" }` for new projects. Existing configurations continue to use issuer-scoped identity when this option is omitted.
