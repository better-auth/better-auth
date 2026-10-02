---
"@better-auth/core": patch
---

Allow table-level indexes to reference the implicit primary key `id`, so plugins can declare compound indexes such as `["organizationId", "id"]` without redeclaring `id`.
