---
"better-auth": patch
---

Captcha provider verification requests now time out after 10 seconds and fail closed, so a slow or unreachable captcha provider can no longer tie up a request indefinitely.
