---
"@better-auth/drizzle-adapter": patch
---

Prevent one-to-one joins from failing in Drizzle Relations v1 and v2 when `usePlural` is enabled. Resolve generated and legacy relation keys from Drizzle runtime metadata, including Relations v2 setups without an adapter schema.
