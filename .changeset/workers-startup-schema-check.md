---
"better-auth": patch
---

Schema validation now runs when the auth instance is first used instead of when it is created, so a module-scope instance on Cloudflare Workers no longer logs a validation error on every cold start. On every runtime, a mismatch is no longer logged at startup: the requests that fail report it. Run `npx auth@latest check schema` to check ahead of time.
