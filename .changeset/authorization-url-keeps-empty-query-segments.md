---
"@better-auth/core": patch
---

Authorization URLs now keep empty segments of the authorization endpoint's query, such as a trailing or doubled `&`, so the endpoint's query text is sent exactly as published.
