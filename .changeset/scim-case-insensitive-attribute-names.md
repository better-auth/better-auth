---
"@better-auth/scim": patch
---

If your SCIM provider sends attribute names with different letter case than the SCIM schema, such as `Active` or `Emails`, Better Auth now applies them. Previously these keys were ignored while the request still succeeded, so a `PUT` with `Active: false` left the User active. A request that sends the same attribute twice with different letter case now returns `400 Bad Request`. Providers that send the standard attribute names are unaffected.
