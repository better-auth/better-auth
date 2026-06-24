---
"better-auth": minor
"@better-auth/core": minor
---

Use Microsoft Entra ID's stable `oid` claim as the account identifier instead of the pairwise `sub` claim. Existing Microsoft account rows created with `sub` must be migrated to `oid` before upgrading production traffic.
