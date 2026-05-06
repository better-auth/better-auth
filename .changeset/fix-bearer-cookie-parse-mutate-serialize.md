---
"better-auth": patch
---

The bearer plugin now produces a single entry per cookie name when merging
its session token into the request `Cookie` header. Previously the merged
header could carry two entries for the same name if the request already
had a stale session cookie, which would surface to downstream code that
picks the first occurrence.
