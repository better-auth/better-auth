---
"@better-auth/oauth-provider": minor
---

Add `resourceSeedScope`. Set it to `"process"` to remember finished `resources` seeds for the life of the process instead of per database adapter, so apps that build Better Auth per request (for example on Cloudflare Workers) stop reading `oauthResource` before every request. The default, `"adapter"`, is unchanged. Use `"process"` only when every instance in the process uses the same database.
