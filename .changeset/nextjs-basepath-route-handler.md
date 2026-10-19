---
"better-auth": patch
---

`toNextJsHandler` no longer returns 404 when a Next.js app uses `basePath` and the Better Auth `basePath` includes it (for example `/dev/api/auth`). The prefix Next.js removes from route handler URLs is restored before routing. A `basePath` option is available to set it explicitly.
