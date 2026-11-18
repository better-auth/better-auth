---
"@better-auth/core": patch
---

The edge and browser build now uses the runtime's `AsyncLocalStorage` when one exists, so overlapping requests no longer read each other's request state. Where none exists, the fallback no longer keeps the store of a request that has finished or thrown.
