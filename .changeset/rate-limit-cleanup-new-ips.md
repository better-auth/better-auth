---
"better-auth": patch
---

Prune expired database rate-limit rows on requests from new IPs, throttled to at most once a minute per server instance to prevent unbounded table growth while bounding database query load.
