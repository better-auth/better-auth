---
"@better-auth/drizzle-adapter": patch
---

Treat fields with an omitted `required` property as non-nullable when generating Drizzle Relations v2 schemas. Existing schemas may produce a nullability migration when regenerated.
