---
"@better-auth/telemetry": patch
---

Stop file tracers such as `@vercel/nft` from copying every `package.json` in `node_modules` into deployed functions. Telemetry also detects packages installed in a parent `node_modules`, as in monorepos.
