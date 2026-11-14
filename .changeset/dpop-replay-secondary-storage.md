---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

DPoP now works on deployments that keep verification values only in secondary storage. Before, every request with a DPoP proof to the OAuth provider, UserInfo, or `requireMcpAuth` failed with a 500 error unless `verification.storeInDatabase: true` was set. Used proofs are now recorded in secondary storage, so a replayed proof is still rejected across instances. `createDpopReplayStore` now also accepts the auth context, as `createDpopReplayStore(await auth.$context)`, and picks the same storage.
