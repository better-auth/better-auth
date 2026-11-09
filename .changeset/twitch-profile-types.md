---
"@better-auth/core": minor
---

Twitch now returns current profile data instead of stored ID-token claims. Profile mappings must handle optional fields, and custom ID-token sign-ins using the default profile reader must also supply `accessToken`.
