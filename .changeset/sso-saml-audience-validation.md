---
"@better-auth/sso": patch
---

SAML SSO now rejects responses whose audience, bearer recipient, or response destination does not match the configured Service Provider before creating a session.
