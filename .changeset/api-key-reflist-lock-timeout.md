---
"@better-auth/api-key": patch
---

On Cloudflare Workers, mutating an API key reference list in secondary storage no longer hangs when an earlier request for the same reference ID ended mid-query. Later writers bound their wait on the prior lock and proceed after the bound instead of chaining forever.
