---
"@better-auth/core": minor
---

Installing `@better-auth/core` no longer installs `better-call`, `jose`, `kysely`, or its other peer dependencies, so an app or SDK can depend on it for `@better-auth/core/oauth2/dpop-client` alone. Projects that install `better-auth` are not affected. If you use `@better-auth/core` without `better-auth` and import an entry such as `@better-auth/core/oauth2`, add the packages it imports to your dependencies.
