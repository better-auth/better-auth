# @better-auth/memory-adapter

## 1.6.11

### Patch Changes

- [#9568](https://github.com/better-auth/better-auth/pull/9568) [`0cbddb8`](https://github.com/better-auth/better-auth/commit/0cbddb8fa4eb19fbca75e9822134f89b3604286a) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `internalAdapter.consumeVerificationValue(identifier)`: atomically consume a verification row keyed by identifier. The first concurrent caller receives the row; later racers receive `null`. Backed by a new `DBAdapter.consumeOne` primitive implemented natively per adapter (memory, mongo, drizzle, kysely, prisma), with a `transaction(findMany + delete)` factory fallback. `SecondaryStorage.getAndDelete` is added as an optional companion; Redis ships it via an atomic Lua get-and-delete operation for compatibility with Redis versions before 6.2.

- [`c6918ec`](https://github.com/better-auth/better-auth/commit/c6918ecc9e3a75892169415d7f6c95b591b6a52d) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Fix race condition in the OAuth refresh-token grant rotation: two concurrent requests presenting the same refresh token both passed the `revoked` check before either revocation write completed, so each minted a fresh refresh token (forked family). `createRefreshToken` now performs an atomic compare-and-swap on the parent row (`UPDATE ... WHERE id = ? AND revoked IS NULL`) before issuing the new token, and `revokeRefreshToken` uses the same CAS. The loser of a concurrent rotation receives `invalid_grant`; the parent row's `revoked` flag is set, so any subsequent replay trips the existing family-invalidation guard. The `oauthRefreshToken.token` column gains a `unique` constraint for parity with `oauthAccessToken.token`.

  `@better-auth/memory-adapter` now treats `undefined` and `null` as equivalent under an `eq null` `where` clause, mirroring SQL `IS NULL` and Mongo's missing-or-null semantics. The adapter factory's `transformInput` skips writing optional fields whose value is `undefined`, so a CAS predicate like `WHERE revoked IS NULL` against a freshly created row (where the field is absent) used to fail-closed on every call. Without this change the refresh-token rotation above is broken for any deployment using the in-memory adapter.

  **Migration note:** the better-auth migration generator only emits `UNIQUE` for newly-created columns. Existing installs will not get the new `oauthRefreshToken.token` unique constraint via `migrate`/`generate`; add it manually if your operational tooling relies on it (e.g. `CREATE UNIQUE INDEX oauth_refresh_token_token_uniq ON "oauthRefreshToken" (token);`). The CAS fix above does not depend on the database-level constraint to be correct; the constraint is defense-in-depth so collisions from buggy custom `generateRefreshToken` callbacks fail loudly.

  Strict family invalidation on contested rotations (per RFC 9700 §4.14) is deferred to a follow-up minor; closing it cleanly requires opt-in transactional rotation in the adapter contract so the family-delete cannot interleave with the winner's in-flight access-token insert.

- Updated dependencies [[`0cbddb8`](https://github.com/better-auth/better-auth/commit/0cbddb8fa4eb19fbca75e9822134f89b3604286a), [`da7e50b`](https://github.com/better-auth/better-auth/commit/da7e50beee849c59a2ed1ec6b3a38cc6ab9fb563), [`b0ef96f`](https://github.com/better-auth/better-auth/commit/b0ef96fd8ec08ebb4d6ad0c0557d4b7855703f10), [`e21d744`](https://github.com/better-auth/better-auth/commit/e21d744987476c20a934c79ef226fe6a5f468e22)]:
  - @better-auth/core@1.6.11

## 1.6.10

### Patch Changes

- Updated dependencies [[`2220a6d`](https://github.com/better-auth/better-auth/commit/2220a6d6c25ebd24c8568131636389dc0c12f82b)]:
  - @better-auth/core@1.6.10

## 1.6.9

### Patch Changes

- Updated dependencies [[`815ecf6`](https://github.com/better-auth/better-auth/commit/815ecf62b6f6c5bf656ab55da393ce63d7eed0a6)]:
  - @better-auth/core@1.6.9

## 1.6.8

### Patch Changes

- Updated dependencies [[`9aa8e63`](https://github.com/better-auth/better-auth/commit/9aa8e63de84549634216e13e407cf6d8aa61acc3)]:
  - @better-auth/core@1.6.8

## 1.6.7

### Patch Changes

- Updated dependencies [[`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162), [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5), [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb)]:
  - @better-auth/core@1.6.7

## 1.6.6

### Patch Changes

- Updated dependencies [[`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7), [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b), [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da)]:
  - @better-auth/core@1.6.6

## 1.6.5

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.5

## 1.6.4

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.4

## 1.6.3

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.3

## 1.6.2

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.2

## 1.6.1

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.1

## 1.6.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add case-insensitive query support for database adapters

### Patch Changes

- Updated dependencies [[`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33)]:
  - @better-auth/core@1.6.0

## 1.6.0-beta.0

### Minor Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add case-insensitive query support for database adapters

### Patch Changes

- Updated dependencies [[`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b)]:
  - @better-auth/core@1.6.0-beta.0
