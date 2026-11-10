---
"@better-auth/core": patch
---

Fix authentication requests that hung on Cloudflare Workers with runtime schema validation enabled (the default for Kysely-backed databases such as D1). Previously, if the request that started validation ended before validation finished, every later request in that isolate waited forever. Each request now runs its own validation until one completes, and completed results stay cached until a programmatic migration invalidates them. On other runtimes, requests that arrive before the first validation completes may each run a read-only schema lookup.
