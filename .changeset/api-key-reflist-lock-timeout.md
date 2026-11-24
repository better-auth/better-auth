---
"@better-auth/api-key": patch
---

On Cloudflare Workers, a write to an API key reference list in secondary storage no longer hangs when an earlier request for the same reference ID ended without releasing its lock. A writer now stops waiting five seconds after it reaches the front of the queue and proceeds. If the earlier writer was only slow, the two writes can overlap and one update to the list can be lost.
