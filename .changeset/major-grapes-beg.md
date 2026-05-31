---
"better-auth": patch
---

`nextCookies()` plugin now correctly skips session refresh during RSC navigation when Next.js middleware is present. Previously, middleware caused Next.js to strip the `RSC` header before the plugin could read it, resulting in unnecessary database writes. Use the new `nextCookiesMiddleware` helper in your middleware to forward RSC context headers.
