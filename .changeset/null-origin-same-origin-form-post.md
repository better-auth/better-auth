---
"better-auth": patch
---

Accept a same-origin form submission whose `Origin` the browser nulled. A page served `Referrer-Policy: no-referrer` — the recommended policy for screens whose URL carries a secret, such as password reset and OAuth consent — sends the literal `Origin: null` on an HTML form it navigates with, and `validateOrigin` rejected it as `MISSING_OR_NULL_ORIGIN`. `Sec-Fetch-Site: same-origin` now vouches for that case. Every other `null` Origin still fails: a sandboxed iframe, a `data:` document, or a request with no Fetch Metadata at all. `fetch()` callers are unaffected either way.
