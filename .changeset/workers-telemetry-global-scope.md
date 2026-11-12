---
"@better-auth/telemetry": patch
---

Enabling telemetry without a static `baseURL` no longer fails every request to an auth instance created at module scope on Cloudflare Workers.
