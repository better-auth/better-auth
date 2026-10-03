---
"better-auth": patch
---

Let bundlers tree-shake zod: field schemas no longer look zod up by a runtime key (`z[type]()`), which kept all of zod, its locales included, in every server bundle.
