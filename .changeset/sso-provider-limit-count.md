---
"@better-auth/sso": patch
---

SSO provider registration now enforces `providersLimit` even when the account already has more providers than `findMany` would return.
