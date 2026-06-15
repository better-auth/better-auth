---
"better-auth": patch
---

Session and account cache cookies that sit close to the browser's per-cookie size limit (for example with a long `cookiePrefix` or many cached fields) are no longer silently dropped by the browser. They are now split across chunks so the full value is preserved.
