---
"better-auth": patch
---

`parseSetCookieHeader` now drops cookies whose decoded value contains characters outside the RFC 6265 cookie-octet set (e.g. `;`, `"`, `\`), matching the validation already applied to request `Cookie` headers.
