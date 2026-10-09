---
"@better-auth/oauth-provider": patch
---

OAuth client privilege callbacks now receive the requested `clientId` for actions on an existing client, so policies can distinguish clients without parsing the request. Creation and listing still have no client ID.
