---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

On Cloudflare Workers, sign-ins with a `genericOAuth` provider that uses `discoveryUrl`, and OAuth provider requests that use a configured resource (`resources`), no longer hang. An auth instance created at module scope retries discovery and resource seeding on later requests. Previously, if the request running that retry ended first, every later request that needed it waited forever. Each request now retries on its own until one succeeds.

On other runtimes, concurrent requests may send a few more discovery requests or resource lookups while the identity provider or database is unreachable.
