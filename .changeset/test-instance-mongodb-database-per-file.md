---
"better-auth": patch
---

`getTestInstance` from `better-auth/test` now gives each test file its own MongoDB database and closes its MongoDB client on cleanup. Before, every MongoDB test instance shared the `better-auth` database and dropped it during cleanup, so test files running in parallel deleted each other's data.
