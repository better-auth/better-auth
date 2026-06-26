---
"@better-auth/sso": patch
"@better-auth/scim": patch
---

Deleting an SSO provider no longer leaves linked accounts that a later provider with the same provider ID can reuse.

SSO and SCIM provider setup now rejects provider IDs already used by another account provider.
