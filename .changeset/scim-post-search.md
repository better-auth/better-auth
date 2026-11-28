---
"@better-auth/scim": patch
---

SCIM Users and Groups now accept RFC 7644 `POST /.search`, using the same collection query as GET list with parameters in a JSON SearchRequest body. Search is a bearer-authenticated read (`scim.users.read` / `scim.groups.read`); `POST` does not grant write. Unsupported `sortBy` and `sortOrder` are ignored, matching GET list.
