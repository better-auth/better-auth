---
"better-auth": patch
---

An `onAPIError.onError` handler that throws or rejects no longer fails the request or causes an unhandled promise rejection. The error is logged and the original error response is returned. Async handlers now finish before the response is sent.
