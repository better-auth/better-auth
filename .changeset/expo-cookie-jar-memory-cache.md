---
"@better-auth/expo": patch
---

Cache parsed cookie jar in memory to eliminate repeated SecureStore reads on repeated `getCookie()` calls and request header hydration.
