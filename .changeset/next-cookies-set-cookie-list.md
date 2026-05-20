---
"better-auth": patch
---

`nextCookies()` now forwards every `Set-Cookie` header from server-side auth API calls. Apps that refresh multiple cookies, such as session and account cache cookies, no longer drop those updates in Next.js server contexts.
