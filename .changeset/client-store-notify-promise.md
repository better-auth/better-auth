---
"@better-auth/core": patch
"better-auth": patch
---

`$store.notify()` now returns a promise that resolves once the atoms bound to the signal reflect the change, so plugin actions can await it.
