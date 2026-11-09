---
"better-auth": patch
---

The OpenAPI schema now documents query parameters for endpoints whose query schema is wrapped in `z.optional()`, such as `/get-session` and Stripe's `/subscription/list`.
