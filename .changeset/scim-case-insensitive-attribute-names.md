---
"@better-auth/scim": patch
---

SCIM User and Group requests now match attribute names case-insensitively, as RFC 7643 requires. Previously, a key with different letter case, such as `Active` or `Emails`, was ignored: a `PUT` with `Active: false` left the User active. A request that names the same attribute twice with different letter case now returns `400 Bad Request`.
