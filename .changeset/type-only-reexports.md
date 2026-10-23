---
"better-auth": patch
---

Type declarations no longer list type-only exports as values, so importing one as a value now fails type checking instead of resolving to `undefined` at runtime.
