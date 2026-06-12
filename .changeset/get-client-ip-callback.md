---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/api-key": patch
---

Add `advanced.ipAddress.getClientIp`, a callback that resolves the client IP before the header-based lookup. Return a string to use it (validated and normalized) or `null`/`undefined` to fall through to `ipAddressHeaders`, letting you delegate to a framework's trust-proxy logic (e.g. Fastify's `req.ip`) or custom parsing.

Also dedupe the `getIp` copy in `@better-auth/api-key`, which now re-exports the canonical resolver from `better-auth`.
