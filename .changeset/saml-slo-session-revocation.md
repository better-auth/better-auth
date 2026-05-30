---
"@better-auth/sso": patch
---

Fix SAML Single Logout leaving the user signed in. The logout handlers passed the session row id to a delete that matches on the session token, so the session was never removed. The stored SAML session record now carries the session token, and all three logout paths revoke the session by token.
