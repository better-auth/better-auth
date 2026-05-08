---
"better-auth": patch
---

Endpoints that set cookies before redirecting (such as social sign-in
callbacks and magic-link verification) no longer emit each `Set-Cookie`
entry twice on the response.
