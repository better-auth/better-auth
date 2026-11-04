---
"@better-auth/sso": patch
---

Add opt-in signLogoutRequests and signLogoutResponses controls for outgoing SAML Single Logout messages, independent of incoming signature requirements. Preserve SP-initiated logout callbackURL in RelayState.
