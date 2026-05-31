---
"@better-auth/sso": patch
---

Fix a high-severity XML injection in signed SAML assertions (GHSA-34r5-q4jw-r36m) by updating `samlify` from 2.10.2 to 2.13.1. A crafted `AttributeValue` could escalate privileges.

samlify 2.11 replaced `node-forge` with Node's native crypto, which parses private keys through OpenSSL 3 and rejects PEM blocks that carry leading whitespace. SAML private keys are now normalized before they reach samlify, so a key pasted with indentation (for example from an indented YAML or JSON config) keeps loading.

IdP-initiated Single Logout now derives its response from the parsed logout request, which fixes response generation under samlify 2.13. When mapping SAML attributes to user fields, a multi-valued attribute is read by its first value.
