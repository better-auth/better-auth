---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Fixed replay protection for apps that set `advanced.database.generateId` to `"uuid"` or `"serial"`. Default id generation is unaffected.

With `"uuid"`, replayed SAML assertions, DPoP proofs, and `private_key_jwt` client assertions are now rejected. Previously, depending on the database, a replay was accepted (for example on Postgres) or these flows failed with a `NOT NULL` error on the `id` column (for example on SQLite and MySQL). No migration is needed.

With `"serial"`, these checks cannot work with numeric ids, so they now fail with an error instead of silently accepting replays:

- SSO SAML sign-in fails.
- DPoP-bound requests checked against the database replay store fail. This covers the OAuth provider's endpoints, `requireMcpAuth`, and `createDpopReplayStore`.
- `private_key_jwt` client authentication fails.
- SIWE sign-in ignores the `email` field and uses the wallet-derived address.

These features require string ids: the default, `"uuid"`, or a custom `generateId` function. Magic link and email OTP sign-in keep working with `"serial"`.

Plugins that store their own single-use records can derive an id that every string id setting keeps with `encodeDeterministicId` from `@better-auth/core/db/adapter`.
