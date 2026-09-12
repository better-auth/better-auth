---
"better-auth": patch
---

Make enabling two-factor safe under concurrent requests by converging on a single `twoFactor` row per user.
