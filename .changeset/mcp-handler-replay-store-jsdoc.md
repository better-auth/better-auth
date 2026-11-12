---
"@better-auth/mcp": patch
---

The `dpop.replayStore` JSDoc on `createMcpProtectedRequestHandler` now says the default store is in memory and safe only for a single long-lived instance, and that multi-instance or serverless deployments should pass a shared store such as `createDpopReplayStore(internalAdapter)`.
