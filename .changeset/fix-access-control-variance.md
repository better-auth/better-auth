---
"better-auth": patch
---

Fix TypeScript generic variance on `AccessControl` by declaring it as an interface instead of a `ReturnType` type alias. This allows `AccessControl<CustomStatements>` to be assignable to `AccessControl` without type errors when passing custom access control to `organizationClient()` or `adminClient()`.
