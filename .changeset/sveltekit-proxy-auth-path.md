---
"better-auth": patch
---

Fix `svelteKitHandler` returning 404 for `/api/auth/*` behind a TLS-terminating proxy or tunnel.

`isAuthPath` compared full origins, so a request that SvelteKit reports as `http://<host>` (for example behind ngrok, or with adapter-node's default scheme) never matched a `baseURL` configured as `https://<host>`. The request fell through to SvelteKit's router and 404'd. Auth-route detection now compares the host and path only; the scheme is not a trust boundary and Better Auth still validates the host via `trustedOrigins` / `baseURL.allowedHosts`.

Fixes #11756
Fixes #11679
