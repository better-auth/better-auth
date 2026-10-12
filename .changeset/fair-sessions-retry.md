---
"better-auth": patch
---

Fix `customSession` treating session lookup failures as signed-out users. Server-side `getSession` now throws an API error, and HTTP clients receive an error response.
