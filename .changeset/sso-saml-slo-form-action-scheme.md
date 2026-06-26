---
"@better-auth/sso": patch
---

SAML single logout now rejects IdP SLO POST URLs that use non-http(s) schemes, such as `javascript:` or `data:`.
