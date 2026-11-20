---
"better-auth": patch
---

`getTestInstance` from `better-auth/test` now runs every instance cleanup when one of them fails (several failures surface as an `AggregateError`), so later instances no longer leave their database or connection open.
