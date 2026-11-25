---
"better-auth": patch
---

Add `tokenType` to the `get-access-token` and `refresh-token` endpoints to align with the OpenAPI schema, which expects the response to include `tokenType`.
