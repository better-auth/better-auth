---
"better-auth": patch
---

Plugin `schema` overrides such as `modelName` and field renames no longer leak between instances of the same plugin in one process. `mergeSchema` now applies overrides to a copy instead of mutating the plugin's shared schema.
