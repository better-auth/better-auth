---
"better-auth": patch
---

On Cloudflare Workers, consuming a verification value no longer hangs when an earlier request for the same identifier ended mid-query. A superseded code can also no longer be consumed while a newer one is being verified on a database without transactions.
