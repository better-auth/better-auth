---
"@better-auth/oauth-provider": minor
---

`allowedScopes` now has one storable contract across adapters:

- In plugin configuration, omit `allowedScopes` for typed config (or pass `null` at runtime) to allow every requested scope. An empty array (`[]`) in config is rejected at startup with guidance to use `disabled: true` to prevent ambiguity with blocking access.
- In the admin CRUD endpoints (`adminCreateOAuthResource` and `adminUpdateOAuthResource`), passing `[]`, `null`, or omitting `allowedScopes` allows every requested scope (unrestricted).
- A non-empty array is an allowlist; scopes outside it are removed and an empty intersection is rejected with `invalid_scope`. Scope strings are normalized by trimming surrounding whitespace in both config seed and admin CRUD, preventing exact-match failures. Empty or whitespace-only scope strings are rejected.
- Newly created or seeded unrestricted resources are stored and returned as `allowedScopes: []` instead of `null`, enabling consistent storability across adapters (such as Prisma on PostgreSQL where list columns cannot store `null`).
- Rows created before this change remain as stored (which may return `allowedScopes: null` in SQL databases); both `null` and `[]` are treated as unrestricted at token issuance and both round-trip cleanly when passed back to the admin update endpoint. Updating a row with `null` or `[]` normalizes the stored value to `[]`.

**Migration:** resources whose stored `allowedScopes` is empty currently refuse every token. This includes Prisma rows where SQL `NULL` was read back as `[]`. After upgrading, those resources allow every requested scope. If you relied on an empty array to block a resource, set `disabled: true` for it before upgrading. Existing rows are not rewritten and no database migration is required. Configured `resources` entries with `allowedScopes: []` fail validation at startup, and the `mcp()` resource no longer needs the explicit workaround.

Verified on Prisma/PostgreSQL. CockroachDB and MongoDB were not part of the acceptance run.
