---
"@better-auth/core": patch
---

Fix plugins whose `init` returns `options: undefined`, such as `testUtils()`, failing to typecheck when `exactOptionalPropertyTypes` is enabled.
