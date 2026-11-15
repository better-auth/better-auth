---
"@better-auth/oauth-provider": minor
---

`provider.issueAuthorizationCode()` reuses the results of `authenticateClient()` and `verifyDpopProof()` from the same request, so a plugin endpoint can check the client and its DPoP key before the user's credentials and then issue the code. Before, the second check rejected a `private_key_jwt` assertion or a DPoP proof as replayed. A `client_id` or `dpop_jkt` in the query must match what those calls proved, and only results the provider produced on that request are reused.
