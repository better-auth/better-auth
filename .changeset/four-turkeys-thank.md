---
"@better-auth/drizzle-adapter": minor
---

Add a new `@better-auth/drizzle-adapter/relations-v2` entry point for projects using Drizzle Relations v2. The schema generator now emits relations using `defineRelationsPart` so the generated auth schema can be merged alongside your app's relations without changing your database structure.
