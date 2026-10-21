---
"@better-auth/core": minor
---

Twitch profiles now use access tokens, so account info remains available after stored ID tokens expire. Mappings must handle optional profile fields and receive profile data rather than ID-token metadata; ID-token sign-ins using the default profile reader must also pass `accessToken`.
