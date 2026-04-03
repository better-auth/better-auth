# better-auth

## 1.6.0-beta.0

### Minor Changes

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Add case-insensitive query support for database adapters

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Return additional user fields and session data from the magic-link verify endpoint

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Allow passwordless users to enable, disable, and manage two-factor authentication

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Prevent updateUser from overwriting unrelated username or displayUsername fields

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Use non-blocking scrypt for password hashing to avoid blocking the event loop

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Enforce username uniqueness when updating a user profile

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Align session fresh age calculation with creation time instead of update time

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Compare account cookie by provider accountId instead of internal id

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Trigger session signal after requesting email change in email-otp plugin

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Rethrow sendOTP failures in phone-number plugin instead of silently swallowing them

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Read OAuth proxy callback parameters from request body when using form_post response mode

- Updated dependencies [[`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356)]:
  - @better-auth/drizzle-adapter@1.6.0-beta.0
  - @better-auth/kysely-adapter@1.6.0-beta.0
  - @better-auth/memory-adapter@1.6.0-beta.0
  - @better-auth/mongo-adapter@1.6.0-beta.0
  - @better-auth/prisma-adapter@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
  - @better-auth/telemetry@1.5.6
