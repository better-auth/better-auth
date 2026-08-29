---
"@better-auth/expo": patch
---

Serialize async secure-storage access in the Expo client so a request started while another response is rewriting the chunked cookie jar no longer reads an empty or torn value, logs `Error parsing JSON`, and goes out without a `Cookie` header.
