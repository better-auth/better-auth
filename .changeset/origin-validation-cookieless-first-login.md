---
"better-auth": patch
---

Email sign-in and sign-up now validate the `Origin` or `Referer` header against `trustedOrigins` even when the request carries no cookies. Requests that send no `Origin`/`Referer` header and no Fetch Metadata (such as curl or server-to-server clients) are unaffected. A non-browser client that sends an untrusted `Origin`/`Referer` without cookies now receives a 403 and must add that origin to `trustedOrigins`.
