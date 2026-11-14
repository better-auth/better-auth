---
"@better-auth/core": patch
---

The default in-memory DPoP replay store used by `verifyAccessTokenRequest` no longer slows down as traffic grows. Before, each DPoP request scanned every proof recorded in the replay window, so CPU time per request grew with the request rate.
