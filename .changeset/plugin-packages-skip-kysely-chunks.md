---
"@better-auth/api-key": patch
"@better-auth/electron": patch
"@better-auth/expo": patch
"@better-auth/scim": patch
"@better-auth/sso": patch
"@better-auth/stripe": patch
"better-auth": patch
---

Plugin packages no longer import from the `better-auth` root, so bundlers that split code stop emitting unused Kysely chunks when used with `better-auth/minimal`.
