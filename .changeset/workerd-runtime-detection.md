---
"@better-auth/core": patch
"@better-auth/telemetry": patch
---

Telemetry now reports Cloudflare Workers as `workerd` instead of `node` when `nodejs_compat` is enabled. `@better-auth/core/env` exports the runtime detection it uses.
