---
"@better-auth/core": patch
---

On Cloudflare Workers, auth requests no longer hang in an isolate after the request that first loaded Better Auth was canceled. Before, every later request in that isolate could wait until the isolate was recycled. No config change is needed for Workers that set the `nodejs_compat` or `nodejs_als` compatibility flag. A Worker with neither flag, on a compatibility date before 2026-08-04, now fails when it loads with `No such module "node:async_hooks"`, instead of on its first auth request.
