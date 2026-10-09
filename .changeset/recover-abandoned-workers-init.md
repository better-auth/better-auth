---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/telemetry": patch
---

Recover on Cloudflare Workers when the request that started initialization or the schema check responds before it settles, so later requests in an isolate that imports Better Auth at startup no longer hang. Initialization now starts on the first request that needs the auth context, and reads of `auth.$context` can return different promises for the same context. `withCloudflare` from `better-auth/cloudflare` keeps initialization and the schema check running past that request.
