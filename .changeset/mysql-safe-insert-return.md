---
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
---

Replace unsafe MySQL insert-return fallback with a robust cascading strategy (ID lookup, LAST_INSERT_ID for serial, unique column match, full-field match) wrapped in a transaction. Emits a one-time startup warning when MySQL is used with generateId: false.
