---
"@better-auth/sso": patch
---

The SAML single-logout POST form now only emits http(s) URLs into the form `action`, rejecting `javascript:`/`data:` IdP SLO locations.
