---
"better-auth": patch
"@better-auth/api-key": patch
---

fix(workers): do not chain verification consume or api-key reference-list locks across requests on Cloudflare Workers, where I/O from an ended request never settles and would hang later callers for the same key.
