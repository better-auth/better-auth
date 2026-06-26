---
"@better-auth/sso": patch
"@better-auth/scim": patch
---

Deleting an SSO provider no longer leaves linked accounts that a later provider with the same provider ID can reuse.

SSO and SCIM provider setup now rejects provider IDs already used by another account provider.

SSO provider updates now reject identity-defining changes, such as issuer, login endpoints, client ID, SAML metadata, or user ID mappings, after accounts are linked. Secret rotation and same-value updates still work.
