---
"better-auth": patch
---

Session and account cache cookies near the browser's per-cookie size limit (for example with a long `cookiePrefix` or many cached fields) are now split into chunks instead of being silently dropped by the browser. A cache too large to fit even when chunked is skipped with a warning rather than failing the request, so reads fall back to the database.
