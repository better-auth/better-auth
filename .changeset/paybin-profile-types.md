---
"@better-auth/core": minor
---

Paybin now uses its published `/oauth/*` endpoints and returns UserInfo data instead of stored ID-token claims. Profile mappings must handle omitted email, and custom ID-token sign-ins using the default profile reader must also supply `accessToken`.
