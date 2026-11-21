---
"@better-auth/sso": patch
---

Signing out with a bearer token now removes the session's SAML single logout records when sessions are stored in the database. Before, they were left behind.
