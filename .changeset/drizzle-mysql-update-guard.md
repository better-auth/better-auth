---
"@better-auth/drizzle-adapter": patch
---

Fix MySQL updates returning null when the `where` clause has a range condition on a field the update changes.
