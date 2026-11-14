---
"@better-auth/cimd": minor
---

Expose `createCimdMetadataResolver` and decouple metadata HTTP fetching and caching from database client persistence. This allows request-scoped runtimes (e.g. Cloudflare Workers, serverless functions) to share metadata resolution, caching, and coalescing across concurrent requests while ensuring each request persists client records using its own database context (#12358).
