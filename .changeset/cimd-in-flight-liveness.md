---
"@better-auth/cimd": patch
---

Bound how long a request may wait on a shared in-flight CIMD metadata resolution, and reclaim wedged in-flight entries (with their fetch permits) once they outlive the fetch bound, so a cancelled request cannot wedge a client_id or starve the concurrency budget on runtimes like Cloudflare Workers.
