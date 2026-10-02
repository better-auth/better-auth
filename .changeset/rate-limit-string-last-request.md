---
"better-auth": patch
---

Fix the `X-Retry-After` header on database rate limiting when the driver returns `lastRequest` as a string, as node-postgres does for `int8` columns. It was a huge number instead of the seconds left in the window.
