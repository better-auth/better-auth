---
"better-auth": patch
---

Surface session lookup failures from custom sessions instead of treating them as signed-out users. During a lookup failure, server-side `getSession` now rejects with `INTERNAL_SERVER_ERROR` and HTTP clients receive a 500 error instead of a successful `null` session; callers that previously treated failures as sign-outs may need to handle this error. Successful and genuinely absent sessions are unchanged.
