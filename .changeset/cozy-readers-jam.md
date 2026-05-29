---
"better-auth": patch
---

getToken in the generic-oauth plugin now receives requestURL — the full URL of the incoming OAuth callback request, including any extra query parameters appended by the provider.
