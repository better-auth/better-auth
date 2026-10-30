---
"@better-auth/drizzle-adapter": patch
---

On MySQL with `generateId: "serial"`, the default adapter now uses the ID returned by the insert to retrieve the created row correctly on connection pools. Existing lookup fallbacks are preserved when Drizzle does not return a generated ID.
