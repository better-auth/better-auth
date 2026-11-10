---
"@better-auth/scim": patch
---

SCIM Groups with more than 100 members now work in full. Previously, a `POST` returned `400`, and `PUT`, `PATCH` and `DELETE` could leave members or mapped roles behind. Role mapping no longer skips Users who are in several Groups, and the managed connection endpoints return every connection and credential instead of the first 100.

If you use a custom database adapter, it must accept a `findMany` `limit` of up to 2,147,483,647.
