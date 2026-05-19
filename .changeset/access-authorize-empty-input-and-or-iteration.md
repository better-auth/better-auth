---
"better-auth": patch
---

`role.authorize` now treats empty action lists (`[]` or `{ actions: [] }`) as unauthorized, and evaluates each requested resource under the `OR` connector before returning the result.
