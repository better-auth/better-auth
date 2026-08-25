---
"@better-auth/core": patch
---

Stop double-pluralizing model names that already end in `s` when `usePlural` is enabled. The `jwks` table was generated with an extra trailing `s`.
