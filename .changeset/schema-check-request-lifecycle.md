---
"@better-auth/core": patch
---

Authentication requests no longer hang on Cloudflare Workers when the request that started schema validation ends before validation finishes. On Workers, each request now runs its own schema lookup until one completes.
