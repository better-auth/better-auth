---
"@better-auth/api-key": patch
---

On Cloudflare Workers, mutating an API key reference list in secondary storage no longer hangs when an earlier request for the same reference ID ended mid-query.
