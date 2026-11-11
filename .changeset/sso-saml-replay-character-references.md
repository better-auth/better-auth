---
"@better-auth/sso": patch
---

SAML providers that allow IdP-initiated sign-in (`allowIdpInitiated: true`) or turn off InResponseTo validation (`enableInResponseToValidation: false`) now reject a signed SAML response submitted again with its assertion ID written using XML character references, such as `&#95;` in place of `_`. Before, the re-spelled copy passed replay protection and signed the user in again. With the default SAML settings, a replayed response was already rejected.
