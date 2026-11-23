---
"@better-auth/api-key": patch
---

On Cloudflare Workers, API key writes to secondary storage can proceed when an earlier request for the same reference ID ends without releasing its lock. Each writer at the front of the queue gets its own five-second timeout.
