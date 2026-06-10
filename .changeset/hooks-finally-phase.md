---
"better-auth": minor
"@better-auth/core": minor
---

Add `hooks.finally` phase that runs at the end of the request lifecycle even when an earlier phase throws. Plugin declaration order does not affect when finally hooks run, making them ideal for pipeline-end work like flushing accumulated state without depending on plugin position.
