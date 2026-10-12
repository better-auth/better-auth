---
"@better-auth/core": patch
---

On Cloudflare Workers, auth requests no longer hang in an isolate after the request that first loaded Better Auth was canceled. Before, every later request in that isolate waited forever until the isolate was recycled. No config change is needed; Workers still need the `nodejs_compat` or `nodejs_als` compatibility flag.
