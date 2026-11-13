# @better-auth/prisma-adapter

## 1.7.23

## 1.7.22

### Patch Changes

- [#12333](https://github.com/better-auth/better-auth/pull/12333) [`6536174`](https://github.com/better-auth/better-auth/commit/6536174213f63a8d544cd0d018659515bab5f8ad) Thanks [@bytaesu](https://github.com/bytaesu)! - Fix `getSession` failing with "Failed to get session" when a `user.additionalFields` entry references a table outside the Better Auth schema, including with database joins enabled on Drizzle and Prisma. Join resolution now matches `references.model` against schema keys only.

## 1.7.21

### Patch Changes

- [#12126](https://github.com/better-auth/better-auth/pull/12126) [`4739122`](https://github.com/better-auth/better-auth/commit/4739122fa67c77cde71c4d1b60d84483fc1bf11b) Thanks [@hardikguptaofficialgit](https://github.com/hardikguptaofficialgit)! - On Prisma with MongoDB, when your id columns use `@db.ObjectId`, magic link and email OTP sign-in for users with an unverified email no longer fail with a 500 (`Malformed ObjectID`). SAML sign-in, DPoP-bound OAuth requests, and `private_key_jwt` client authentication are fixed the same way, and Sign-In with Ethereum now keeps the email the user supplied instead of a placeholder. Setups with plain `String` id columns and other databases are unaffected.

- [#11807](https://github.com/better-auth/better-auth/pull/11807) [`b241ffc`](https://github.com/better-auth/better-auth/commit/b241ffc9404fa182fa60a2cf5c54765334729f4f) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - The Prisma adapter with `provider: "mongodb"` now matches `contains`, `starts_with`, and `ends_with` filters, and every case-insensitive filter, as literal text. Before, regex characters in the value acted as patterns: an admin `listUsers` search for `.` with `searchOperator: "contains"` returned every user, a `deleteMany` with `starts_with: ".*"` deleted every row, and a case-insensitive lookup for `a.c@example.com` also matched `abc@example.com`. Other providers are unaffected.

- [#12390](https://github.com/better-auth/better-auth/pull/12390) [`57fa843`](https://github.com/better-auth/better-auth/commit/57fa8432d89117e7a1ce49cdb7f194dbde0839e3) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Prisma adapter updates that compare a unique field with `null` no longer fail with a Prisma validation error. Any `update` whose `where` has no unique equality match, including these, now changes one matching row instead of every match, and returns that row even when the update changes a filtered field or the `id`. Use `updateMany` to change every matching row.

## 1.7.20

### Patch Changes

- [#11809](https://github.com/better-auth/better-auth/pull/11809) [`265629c`](https://github.com/better-auth/better-auth/commit/265629cb958913cf4459ea7545ae212ccaa485e1) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - If you use the Prisma adapter with PostgreSQL or MongoDB, `incrementOne` and `update` calls that filter with `mode: "insensitive"` now match rows whose stored value differs only in case. Previously `incrementOne` with a non-id filter, or `update` that combined an id or unique field with an insensitive filter, compared that filter case-sensitively and returned `null` for a mixed-case row. Other providers, which ignore `mode`, are unaffected.

- [#11806](https://github.com/better-auth/better-auth/pull/11806) [`e9b43d7`](https://github.com/better-auth/better-auth/commit/e9b43d7149cec0b52e8194b1341e582d0ea19bba) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - With `provider: "mongodb"`, queries that look for an empty optional field now also match records where that field was never written. Before, they matched only fields explicitly stored as `null`. Better Auth leaves optional fields out of new records, so these lookups often found nothing. This could break flows such as refresh-token rotation in the OAuth provider (`invalid_grant`), device-code approval, SCIM account linking, and API key rate-limit windows. No action is needed. Other Prisma providers are unaffected.

## 1.7.19

## 1.7.18

## 1.7.17

## 1.7.16

## 1.7.15

## 1.7.14

## 1.7.13

## 1.7.12

## 1.7.11

## 1.7.10

## 1.7.9

## 1.7.8

### Patch Changes

- [#11512](https://github.com/better-auth/better-auth/pull/11512) [`4175b34`](https://github.com/better-auth/better-auth/commit/4175b34a8f70d5abb542ac7fc205dc42f564c03a) Thanks [@bytaesu](https://github.com/bytaesu)! - Align the installed `@better-auth/utils` version with `better-call` while accepting `^0.4.2 || ^0.5.0` across official package peers.

## 1.7.7

## 1.7.6

### Patch Changes

- [#11319](https://github.com/better-auth/better-auth/pull/11319) [`41b7dc1`](https://github.com/better-auth/better-auth/commit/41b7dc15de41a8726422c392a4857d8764828891) Thanks [@bytaesu](https://github.com/bytaesu)! - Fix schema validation for capitalized custom Prisma model names.

- [#11333](https://github.com/better-auth/better-auth/pull/11333) [`631ac29`](https://github.com/better-auth/better-auth/commit/631ac296a55ccecf51a7995e89a3e528a5f782da) Thanks [@bytaesu](https://github.com/bytaesu)! - Preserve logical model identity when a custom model name matches another schema key.

## 1.7.5

## 1.7.4

## 1.7.3

### Patch Changes

- [#11179](https://github.com/better-auth/better-auth/pull/11179) [`352d012`](https://github.com/better-auth/better-auth/commit/352d012bd54e613782bf4af22aae24443541c77c) Thanks [@bytaesu](https://github.com/bytaesu)! - Validate Drizzle schema objects and generated Prisma client models during initialization, including in production, and report mismatches with guidance for fixing them. These checks do not query the database and cannot detect unapplied migrations.

  For Prisma clients whose model metadata omits nullability, `auth generate` reports required fields that Better Auth never writes by reading the existing Prisma schema. Set `advanced.database.validateSchema: false` to disable runtime validation.

## 1.7.2

## 1.7.1

## 1.7.0

## 1.7.0-rc.6

## 1.7.0-rc.5

## 1.7.0-rc.4

## 1.7.0-rc.3

## 1.7.0-rc.2

## 1.7.0-rc.1

## 1.7.0-rc.0

## 1.7.0-beta.10

## 1.7.0-beta.9

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.9

## 1.7.0-beta.8

### Patch Changes

- Updated dependencies [[`7c7313c`](https://github.com/better-auth/better-auth/commit/7c7313c8189baabd11a2ecb681bd2b16eb40fa4d), [`97903c9`](https://github.com/better-auth/better-auth/commit/97903c9cca47f5fa62cf1d2ab86f6228db04aff0), [`3a79aff`](https://github.com/better-auth/better-auth/commit/3a79aff58ed82e45caf04c2ee4acaf0f4d09a86c)]:
  - @better-auth/core@1.7.0-beta.8

## 1.7.0-beta.7

### Patch Changes

- Updated dependencies [[`3d04fab`](https://github.com/better-auth/better-auth/commit/3d04fababbf3efd4c46a4012f46ed9397715c2e3), [`de8394d`](https://github.com/better-auth/better-auth/commit/de8394de207bae2fe9d0b8d7e901a196c1dc08d0)]:
  - @better-auth/core@1.7.0-beta.7

## 1.7.0-beta.6

### Patch Changes

- Updated dependencies [[`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9)]:
  - @better-auth/core@1.7.0-beta.6

## 1.7.0-beta.5

### Patch Changes

- Updated dependencies [[`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2), [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f), [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b), [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f)]:
  - @better-auth/core@1.7.0-beta.5

## 1.7.0-beta.4

## 1.6.30

### Patch Changes

- Updated dependencies [[`07c1718`](https://github.com/better-auth/better-auth/commit/07c17189f58502bf038e5f22766f8a99df60ac99)]:
  - @better-auth/core@1.6.30

## 1.6.29

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.29

## 1.6.28

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.28

## 1.6.27

### Patch Changes

- Updated dependencies [[`2ae491e`](https://github.com/better-auth/better-auth/commit/2ae491eac3ece50839a0eb2d4f868c4deedac67b)]:
  - @better-auth/core@1.6.27

## 1.6.26

### Patch Changes

- Updated dependencies [[`a30e274`](https://github.com/better-auth/better-auth/commit/a30e274b5daed6057086d76b91d17abfa02196d7)]:
  - @better-auth/core@1.6.26

## 1.6.25

### Patch Changes

- Updated dependencies [[`0ffd1fb`](https://github.com/better-auth/better-auth/commit/0ffd1fb28d44a8266d62791cd4c97e263444d03b)]:
  - @better-auth/core@1.6.25

## 1.6.24

### Patch Changes

- Updated dependencies [[`6758231`](https://github.com/better-auth/better-auth/commit/6758231905d2e86a7b3f058dd05c17ba739aa80f), [`54fab08`](https://github.com/better-auth/better-auth/commit/54fab084469a27257e66a0814523ebac7145ef5d), [`c4d1dda`](https://github.com/better-auth/better-auth/commit/c4d1ddaa952eab7edfec942fab223f35798518ab)]:
  - @better-auth/core@1.6.24

## 1.6.23

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.23

## 1.6.22

### Patch Changes

- Updated dependencies [[`8bd43d9`](https://github.com/better-auth/better-auth/commit/8bd43d9d8312fd9ddbfb8fb5c827cf0a0e55132d)]:
  - @better-auth/core@1.6.22

## 1.6.21

### Patch Changes

- [#10180](https://github.com/better-auth/better-auth/pull/10180) [`90d509e`](https://github.com/better-auth/better-auth/commit/90d509e0b9f72614170ad7124ae9d3a7a97d7d3a) Thanks [@ping-maxwell](https://github.com/ping-maxwell)! - `adapter.update` now returns `null` when no row matches or when it is called without a predicate. Use `updateMany` for intentional bulk updates.

  The Kysely MySQL adapter no longer returns a row after a guarded update misses. Updates with an `id` guard also return the targeted row when `id` is not the first predicate. Keep MySQL rows-matched semantics enabled, which mysql2 does by default through `FOUND_ROWS`; disabling it can make idempotent updates look like misses.

  The Prisma adapter now returns `null` when an update guard excludes the targeted row instead of surfacing Prisma's not-found exception. The shared adapter test suite now asserts the same fail-closed update behavior for adapter implementations.

- Updated dependencies [[`90d509e`](https://github.com/better-auth/better-auth/commit/90d509e0b9f72614170ad7124ae9d3a7a97d7d3a), [`816d7f9`](https://github.com/better-auth/better-auth/commit/816d7f92522518e90d437c2a366d75db56690f86), [`570267c`](https://github.com/better-auth/better-auth/commit/570267cd5e782f018933ce3af4f51dbd250bf7de), [`5953157`](https://github.com/better-auth/better-auth/commit/5953157acf619bcb8233c91952b1e4072202f055)]:
  - @better-auth/core@1.6.21

## 1.6.20

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.20

## 1.6.19

### Patch Changes

- Updated dependencies [[`5bd5e1c`](https://github.com/better-auth/better-auth/commit/5bd5e1cc73d2c9c38e69011f03038b61a4312a63), [`a787e0b`](https://github.com/better-auth/better-auth/commit/a787e0b66b368a1af0b4ba17c9750c2839668246)]:
  - @better-auth/core@1.6.19

## 1.6.18

### Patch Changes

- Updated dependencies [[`b21a5f7`](https://github.com/better-auth/better-auth/commit/b21a5f7f6ca1f63c6b69666a498b4227b15e316c)]:
  - @better-auth/core@1.6.18

## 1.6.17

### Patch Changes

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Counter updates on the memory, Kysely, Drizzle, Prisma, and MongoDB adapters (used for rate limiting and API-key usage limits) are now atomic on the default configuration, where adapter transactions are not enabled. Each adapter implements `incrementOne` natively as a single statement.

- [#9993](https://github.com/better-auth/better-auth/pull/9993) [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - A `delete` that fails for any reason other than the record already being absent now surfaces the error instead of silently reporting success.

- Updated dependencies [[`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`7343284`](https://github.com/better-auth/better-auth/commit/73432841493a2d99144786c986ee57c071d816d8), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7), [`baeaa00`](https://github.com/better-auth/better-auth/commit/baeaa00bc2a600c04f746c7cc2a07065b7691dcc), [`1dbf5bb`](https://github.com/better-auth/better-auth/commit/1dbf5bb59de5d628f0d07d5e846eba8287b831d7), [`fdef997`](https://github.com/better-auth/better-auth/commit/fdef997eb944d85254816f7a4b2d76c06e9b8ec7)]:
  - @better-auth/core@1.6.17

## 1.6.16

### Patch Changes

- Updated dependencies [[`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15), [`cb1cbfa`](https://github.com/better-auth/better-auth/commit/cb1cbfa4ccba1ce13f7fea419a6fc37dcbdc2f15)]:
  - @better-auth/core@1.6.16

## 1.6.15

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.6.15

## 1.6.14

### Patch Changes

- Updated dependencies [[`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - @better-auth/core@1.6.14

## 1.6.13

### Patch Changes

- Updated dependencies [[`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8), [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - @better-auth/core@1.7.0-beta.4

## 1.7.0-beta.3

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.3

## 1.7.0-beta.2

### Patch Changes

- Updated dependencies []:
  - @better-auth/core@1.7.0-beta.2

## 1.7.0-beta.1

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
  - @better-auth/core@1.7.0-beta.1

## 1.7.0-beta.0

### Patch Changes

- Updated dependencies [[`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656)]:
  - @better-auth/core@1.7.0-beta.0
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
