---
"@better-auth/expo": patch
"better-auth": patch
---

The Expo authorization proxy now sets the signed state cookie only for an unexpired state issued by the server. `getAuthStateVerificationIdentifier` is now exported for plugins that look up OAuth state records.
