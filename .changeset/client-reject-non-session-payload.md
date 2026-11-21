---
"better-auth": patch
---

When `/get-session` answers with a body that is not a session object or `null`, such as an HTML page a SPA fallback or proxy served with `200`, `getSession()` now returns `data: null` with an error (or throws with `throw: true`), and `useSession()` reports the error and keeps its previous session data instead of storing the body as the session.
