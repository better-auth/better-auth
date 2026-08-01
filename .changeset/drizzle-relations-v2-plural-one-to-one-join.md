---
"@better-auth/drizzle-adapter": patch
---

Fix one-to-one joins crashing in the Drizzle Relations v2 adapter when `usePlural` is set. The generated schema names a relation backed by a foreign key on the base model after the singular model (`sessions: { user: ... }`) while the table exports stay plural, but the adapter looked the relation up under the plural name.
