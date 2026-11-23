---
"@better-auth/api-key": patch
---

On Cloudflare Workers, mutating an API key reference list in secondary storage no longer hangs when an earlier request for the same reference ID ended mid-query. Later writers now wait at most five seconds for the previous writer, then proceed.
