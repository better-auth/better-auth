---
"@better-auth/drizzle-adapter": patch
---

Fix double serialization of JSON and array fields in SQLite JSON-mode columns. Drizzle now handles serialization, so direct Drizzle queries return the original values. Existing double-encoded data requires migration; custom SQLite schemas should use `text(..., { mode: "json" })` for these fields.
