---
"better-auth": patch
---

`useSession()` and `getSession()` now return an error instead of `data` when `/get-session` answers with a body that is not a session object or `null`, such as an HTML page a SPA fallback or proxy served with `200`. With `throw: true`, `getSession()` throws.
