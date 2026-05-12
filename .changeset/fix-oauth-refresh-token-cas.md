---
"@better-auth/oauth-provider": patch
"@better-auth/memory-adapter": patch
---

Fix race condition in the OAuth refresh-token grant rotation: two concurrent requests presenting the same refresh token both passed the `revoked` check before either revocation write completed, so each minted a fresh refresh token (forked family). `createRefreshToken` now performs an atomic compare-and-swap on the parent row (`UPDATE ... WHERE id = ? AND revoked IS NULL`) before issuing the new token, and `revokeRefreshToken` uses the same CAS. The loser of a concurrent rotation receives `invalid_grant`; the parent row's `revoked` flag is set, so any subsequent replay trips the existing family-invalidation guard. The `oauthRefreshToken.token` column gains a `unique` constraint for parity with `oauthAccessToken.token`.

`@better-auth/memory-adapter` now treats `undefined` and `null` as equivalent under an `eq null` `where` clause, mirroring SQL `IS NULL` and Mongo's missing-or-null semantics. The adapter factory's `transformInput` skips writing optional fields whose value is `undefined`, so a CAS predicate like `WHERE revoked IS NULL` against a freshly created row (where the field is absent) used to fail-closed on every call. Without this change the refresh-token rotation above is broken for any deployment using the in-memory adapter.

**Migration note:** the better-auth migration generator only emits `UNIQUE` for newly-created columns. Existing installs will not get the new `oauthRefreshToken.token` unique constraint via `migrate`/`generate`; add it manually if your operational tooling relies on it (e.g. `CREATE UNIQUE INDEX oauth_refresh_token_token_uniq ON "oauthRefreshToken" (token);`). The CAS fix above does not depend on the database-level constraint to be correct; the constraint is defense-in-depth so collisions from buggy custom `generateRefreshToken` callbacks fail loudly.

Strict family invalidation on contested rotations (per RFC 9700 §4.14) is deferred to a follow-up minor; closing it cleanly requires opt-in transactional rotation in the adapter contract so the family-delete cannot interleave with the winner's in-flight access-token insert.
