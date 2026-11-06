---
"better-auth": patch
---

Emit query parameters in the OpenAPI document for endpoints whose `query` schema is wrapped in `z.optional()`. `/get-session`, `/account-info`, `/callback/{id}` and `/reset-password` previously published no query parameters at all, and neither did plugin endpoints declared the same way, such as `@better-auth/stripe`'s `GET /subscription/list`.
