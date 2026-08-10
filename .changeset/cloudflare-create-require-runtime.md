---
"better-auth": patch
---

Cloudflare Workers apps can now start when importing Better Auth subpaths such as `better-auth/db`. Beta builds were crashing during module initialization before application code ran.
