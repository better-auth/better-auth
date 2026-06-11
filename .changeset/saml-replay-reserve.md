---
"@better-auth/sso": patch
---

A SAML assertion submitted twice at the same time can no longer be accepted more than once; replay protection now holds under concurrent requests.
