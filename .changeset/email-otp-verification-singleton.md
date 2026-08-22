---
"better-auth": patch
"@better-auth/core": patch
---

Fix email-otp verification rows accumulating per identifier by deleting before create instead of relying on a unique constraint the schema never declares
