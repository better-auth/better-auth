---
"auth": patch
---

With `wrangler` installed, `npx auth generate` and `npx auth migrate` read `env` from `cloudflare:workers` through Wrangler's local bindings, so a config that passes a D1 binding is compared with the local D1 database.
