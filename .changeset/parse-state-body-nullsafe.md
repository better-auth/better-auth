---
"better-auth": patch
---

Guard against `c.body` being undefined in `parseState`. Callback requests that arrive as GET leave `c.body` unset in some runtimes, which caused `c.body.state` to throw a `TypeError` before the existing error redirect could run. The state lookup now short-circuits on the query parameter and falls back to `c.body?.state` safely, so a callback without a state parameter redirects to the error page instead of crashing.
