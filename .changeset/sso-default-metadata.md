---
"@better-auth/sso": patch
---

fix(sso): use findSAMLProvider in spMetadata so defaultSSO providers resolve

`/sso/saml2/sp/metadata` was the only SAML endpoint that called `adapter.findOne`
directly, so providers configured via `defaultSSO` (which are not persisted to the
database) caused it to throw `NOT_FOUND`. The endpoint now uses the shared
`findSAMLProvider` helper, matching `signInSSO`, the SAML callback handler, and
`signOut`.
