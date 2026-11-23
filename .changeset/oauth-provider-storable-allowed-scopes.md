---
"@better-auth/oauth-provider": minor
---

`allowedScopes` now has one storable contract across adapters:

- In plugin configuration, omit `allowedScopes` (or pass `null`) to allow every requested scope. An empty array (`[]`) in config is rejected at startup with guidance to use `disabled: true` to prevent ambiguity with blocking access.
- In `adminCreateOAuthResource`, omitting `allowedScopes` allows every requested scope (unrestricted). Passing explicit `null` to either admin endpoint resets to unrestricted, while omitting `allowedScopes` on `adminUpdateOAuthResource` leaves the stored allowlist unchanged. Passing `[]` to either endpoint is rejected, mirroring the config validation. Use `disabled: true` to stop issuing tokens for a resource.
- A non-empty array is an allowlist; scopes outside it are removed and an empty intersection is rejected with `invalid_scope`.
- Newly created or seeded unrestricted resources use a versioned empty list in storage so adapters with non-nullable list columns can persist the policy. Admin responses return `null` for unrestricted resources.

See the 1.8 upgrade guide for configuration changes and how existing resource policies are preserved.
