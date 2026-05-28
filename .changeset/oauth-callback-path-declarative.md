---
"better-auth": minor
"@better-auth/core": minor
---

Derive OAuth `redirect_uri` from the per-request `baseURL` so social and generic-OAuth sign-in work end-to-end under `baseURL: { allowedHosts: [...] }`.

Before this change, the `genericOAuth` plugin captured `ctx.baseURL` at init time and sent providers a relative URI like `/oauth2/callback/<id>` whenever a dynamic baseURL was configured. Auth0 and other strict providers rejected the authorize request. Built-in social providers were unaffected because their endpoints already resolved per-request.

The fix is structural rather than a string patch. Every `OAuthProvider` now declares a `callbackPath: string` that describes its callback path under the per-request `baseURL`. The framework composes `redirectURI = ctx.context.baseURL + provider.callbackPath` inside the sign-in, callback, link-account, and oauth-proxy endpoints. The init-time `ctx.baseURL` is no longer read by any OAuth provider, which removes the bug class.

Resolves #9593. Partial fix for #4151 — `redirect_uri` composition now respects `allowedHosts` for both built-in providers and generic-OAuth providers.

BREAKING CHANGE: Custom `OAuthProvider` implementations must declare `callbackPath`. End-user `betterAuth({...})` config is unaffected; only authors of custom OAuth provider plugins need to update their factories. Convention:

```ts
// built-in lane
callbackPath: `/callback/<provider-id>`,

// generic-oauth lane
callbackPath: `/oauth2/callback/<provider-id>`,
```
