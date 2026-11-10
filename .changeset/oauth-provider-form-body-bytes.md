---
"@better-auth/oauth-provider": patch
---

Read form-urlencoded request bodies by decoding the raw bytes instead of calling `.text()`, so Cloudflare Workers (workerd) no longer logs a "does not appear to be text" warning on every token request that carries repeated `resource` parameters or client credentials in the form body. Parsing is unchanged.
