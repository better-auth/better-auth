---
"@better-auth/telemetry": patch
---

Stop file tracers such as `@vercel/nft` from copying every `package.json` in `node_modules` into deployed functions. Telemetry also reports the installed version of packages hoisted to a parent `node_modules`, as in monorepos.
