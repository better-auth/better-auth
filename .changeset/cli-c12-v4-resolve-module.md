---
"auth": patch
---

simplify auth config loading by leveraging c12 v4's `resolveModule` option to handle `auth`, `default.auth`, and `default` export shapes in a single place
