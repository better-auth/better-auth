---
"better-auth": patch
---

An auth instance created at module scope on Cloudflare Workers no longer logs a schema validation error on every cold start. Validation runs on the first request instead.
