---
"@better-auth/scim": patch
---

Accept `displayName` as a writable field on `POST`/`PUT`/`PATCH /scim/v2/Users`. Correcting the schema's `displayName` mutability to `readWrite` (previous change in this branch) means schema-aware SCIM clients will now send `displayName` on its own, without a structured `name` object - previously that write was silently dropped since `APIUserSchema` didn't include the field. `name.formatted`/`name.givenName`+`familyName` still take precedence when also present.
