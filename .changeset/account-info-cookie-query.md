---
"better-auth": patch
---

`accountInfo({ query: { useAccountCookie: true } })` no longer fails with `[query] Invalid input` when called over HTTP, including from the client.
