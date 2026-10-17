---
"better-auth": patch
---

Fix `testUtils()` failing to typecheck in `plugins` and losing the type of `ctx.test` when `exactOptionalPropertyTypes` is enabled.
