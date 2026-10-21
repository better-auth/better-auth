---
"@better-auth/core": minor
---

**Breaking:** Paybin profiles now use access tokens and discovery’s `/oauth/*` endpoints, so account info remains available after stored ID tokens expire. Mappings must handle an omitted email and receive UserInfo data rather than ID-token metadata; ID-token sign-ins using the default profile reader must also pass `accessToken`.
