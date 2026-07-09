---
"better-auth": patch
---

Prefer exact schema-key matches over `modelName` aliases in `getDefaultModelName`, so remapping a built-in table onto another table's schema key (e.g. `user.modelName = "account"`) does not reroute internal adapter queries to the wrong table.
