---
"auth": patch
---

Fix `generate` emitting the removed Drizzle `relations()` API when drizzle-orm 1.0 is installed. The generator now detects the project's drizzle-orm version and emits `defineRelationsPart` instead so the generated schema compiles against drizzle-orm 1.0+.
