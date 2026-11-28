---
"better-auth": patch
---

Normalize non-JSON and HTML responses to `null` in client `getSession` and `useSession` when `/get-session` returns a non-object payload (e.g. from an SPA fallback or reverse proxy error).
