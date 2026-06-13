---
"better-auth": patch
---

Session refresh no longer emits a cookie Max-Age above the browser's 400-day ceiling when using a database without fractional-second precision.
