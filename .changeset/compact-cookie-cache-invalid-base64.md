---
"better-auth": patch
---

A compact cookie cache value that does not decode, or whose signature is not base64url, no longer makes `getSession` fail with a 500. It is now ignored like any other invalid cache value: `getSession` falls back to the stored session, and `getCookieCache` returns `null`.
