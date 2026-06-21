---
"@better-auth/sso": patch
---

SAML SSO now validates the assertion's `Audience` against this Service Provider's entity id before creating a session, rejecting an assertion that was issued for a different relying party.
