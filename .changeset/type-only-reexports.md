---
"better-auth": patch
---

Type declarations no longer list type-only exports as values, so importing one as a value now fails type checking instead of failing at runtime.
