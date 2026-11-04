---
"better-auth": patch
---

`getTestInstance` from `better-auth/test` now closes the Postgres connection pool and the SQLite database it created when the test file finishes. Previously both stayed open until the test worker exited. With Vitest's default `sequence.hooks: "stack"`, `afterAll` hooks in your test files still run before this cleanup and can keep using the instance.
