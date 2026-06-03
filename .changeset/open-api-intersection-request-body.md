---
"better-auth": patch
---

The OpenAPI spec now includes the `requestBody` for endpoints whose body schema is an intersection (e.g. `/sign-in/email-otp`). Previously these operations were generated without a request body, so the documented fields were missing from the schema.
