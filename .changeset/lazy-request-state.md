---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

Defer OAuth request-state initialization until it is used so single-file bundlers do not crash while importing `better-auth/api` through plugins such as API key.
