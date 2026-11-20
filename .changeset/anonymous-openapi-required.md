---
"better-auth": patch
---

Fix the OpenAPI document generated with the anonymous plugin: the `400` response of `/delete-anonymous-user` declared `required` next to its schema instead of inside it, which made the document fail OpenAPI 3.1 validation.
