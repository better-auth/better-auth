---
"better-auth": patch
---

Fix `genericOAuth` plugin producing a relative `redirect_uri` when using `allowedHosts` dynamic baseURL config. The `init` closure captured `ctx.baseURL` (empty string at startup for dynamic config) instead of deriving the base from the per-request resolved URL available in `data.redirectURI`.
