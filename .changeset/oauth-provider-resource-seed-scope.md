---
"@better-auth/oauth-provider": patch
---

Add a `resourceSeedScope` option so apps that build Better Auth on every request stop reading `oauthResource` before each request. Set it to `"process"` to remember finished `resources` seeds for the life of the process instead of per database adapter. The default, `"adapter"`, is unchanged. Use `"process"` only when every instance in the process uses the same database.
