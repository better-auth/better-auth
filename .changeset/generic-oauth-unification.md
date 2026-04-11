---
"better-auth": minor
"@better-auth/electron": patch
"@better-auth/expo": patch
"@better-auth/oauth-provider": patch
---

Unify generic OAuth into core social sign-in flow. Generic OAuth providers now use `signIn.social` + `callback/:id` instead of dedicated plugin endpoints.

**Breaking changes:**

- `signIn.oauth2({ providerId })` replaced by `signIn.social({ provider })`
- `oauth2.link()` replaced by `linkSocial()`
- Callback URL changed from `/api/auth/oauth2/callback/:id` to `/api/auth/callback/:id` (update your OAuth provider dashboard)
- `genericOAuthClient()` client plugin is no longer needed (deprecated, will be removed in a future release)
- `authorizationUrlParams` and `tokenUrlParams` only accept `Record<string, string>` (function form removed)
- `issuer` and `requireIssuerValidation` config fields removed; when OIDC discovery provides an issuer, callback issuer validation is applied automatically
