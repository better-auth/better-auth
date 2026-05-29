---
"better-auth": patch
---

Email and password hashing on Cloudflare Workers (`nodejs_compat`) now uses the `node:crypto` implementation instead of the pure-JS fallback.
