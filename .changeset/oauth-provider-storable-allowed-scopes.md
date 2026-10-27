---
"@better-auth/oauth-provider": minor
---

`allowedScopes` now has one storable contract across adapters:

- In plugin configuration, omit `allowedScopes` for typed config (or pass `null` at runtime) to allow every requested scope. An empty array (`[]`) in config is rejected at startup with guidance to use `disabled: true` to prevent ambiguity with blocking access.
- In the admin CRUD endpoints (`adminCreateOAuthResource` and `adminUpdateOAuthResource`), passing `null` or omitting `allowedScopes` allows every requested scope (unrestricted). Passing `[]` is rejected, mirroring the config validation — use `disabled: true` to stop issuing tokens for a resource.
- A non-empty array is an allowlist; scopes outside it are removed and an empty intersection is rejected with `invalid_scope`.
- Newly created or seeded unrestricted resources are stored as `allowedScopes: []` instead of `null`, enabling consistent storability across adapters (such as Prisma on PostgreSQL where list columns cannot store `null`). Admin responses serialize an unrestricted allowlist as `null`, which echoes back cleanly.
- Rows created before this change remain as stored (which may hold `allowedScopes: null` in SQL databases); both `null` and `[]` are treated as unrestricted at token issuance and both serialize as `null` on the wire. Passing an explicit `[]` to the admin endpoints is rejected — omit the field or pass `null` instead. Updating a row with `null` normalizes the stored value to `[]`.

**Migration:** resources whose stored `allowedScopes` is empty currently refuse every token. This includes Prisma rows where SQL `NULL` was read back as `[]`. After upgrading, those resources allow every requested scope. If you relied on an empty array to block a resource, set `disabled: true` for it before upgrading. Existing rows are not rewritten and no database migration is required. Configured `resources` entries with `allowedScopes: []` fail validation at startup, and the `mcp()` resource no longer needs the explicit workaround.
