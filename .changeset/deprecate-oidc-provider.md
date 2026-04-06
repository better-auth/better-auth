---
"better-auth": patch
---

deprecate `oidc-provider` plugin in favor of `@better-auth/oauth-provider`

The `oidc-provider` plugin now emits a one-time runtime deprecation warning when instantiated and is marked as `@deprecated` in TypeScript. It will be removed in the next major version. Migrate to `@better-auth/oauth-provider`.
