---
"@better-auth/oauth-provider": minor
---

- Tooling that reads the `oauthResource` table directly sees fewer rows: no row exists for a configured resource until a client is linked to it or an admin edits it. Use the admin resource endpoints to list all resources.
- `merge` and `overwrite` are applied when a resource is read, not written into stored rows. Admin PATCH requests to database rows succeed, but code-configured values stay authoritative for configured fields.
