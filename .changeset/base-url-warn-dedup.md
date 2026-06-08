---
"better-auth": patch
---

The missing base URL warning no longer spams on every request. It now emits only once per process, and is suppressed entirely when `advanced.trustedProxyHeaders` is set (because the URL is resolved from proxy headers at runtime). The warning message has also been updated to clarify that the URL will be inferred from the first incoming request.
