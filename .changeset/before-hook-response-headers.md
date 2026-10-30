---
"better-auth": patch
---

Headers and cookies set by a `hooks.before` hook that does not return early now reach the response instead of being dropped. When the endpoint sets the same header or cookie, the endpoint's value wins.
