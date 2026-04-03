# @better-auth/oauth-provider

## 1.6.0-beta.0

### Minor Changes

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Add optional version field to the plugin interface and expose version from all built-in plugins

### Patch Changes

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Only require storeSessionInDatabase when secondaryStorage is configured

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Allow customIdTokenClaims to override acr and auth_time in ID tokens

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Handle dynamic baseURL config in init without crashing on object-format URLs

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Normalize session timestamps before deriving OIDC auth_time across adapter shapes

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Return JSON redirects from post-login OAuth continuation to fix CORS-blocked 302 responses

- [#8943](https://github.com/better-auth/better-auth/pull/8943) [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356) Thanks [@better-auth-releases](https://github.com/apps/better-auth-releases)! - Enforce database-backed sessions when secondary storage is enabled to fail fast at initialization

- Updated dependencies [[`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356), [`fe516aa`](https://github.com/better-auth/better-auth/commit/fe516aad5edfce239c5b2f02b77e77979356b356)]:
  - better-auth@1.6.0-beta.0
  - @better-auth/core@1.6.0-beta.0
