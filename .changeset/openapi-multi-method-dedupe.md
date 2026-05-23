---
"better-auth": patch
---

Generated OpenAPI schema is now valid for endpoints that expose multiple HTTP methods, such as `/get-session`. Previously these endpoints emitted duplicate `operationId`s and shared response object references, producing schemas that some OpenAPI validators and client generators rejected.
