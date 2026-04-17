---
"better-auth": minor
"@better-auth/electron": minor
"@better-auth/expo": minor
"@better-auth/oauth-provider": minor
---

Rewrite the generic OAuth plugin as a first-class social provider with OAuth 2.1 security defaults. Providers now use `signIn.social` + `callback/:id` instead of dedicated plugin endpoints, with PKCE required by default (OAuth 2.1), RFC 9207 issuer validation, OIDC auto-discovery with `openid` scope injection, and typed provider IDs.

**Breaking changes:**

- `signIn.oauth2({ providerId })` replaced by `signIn.social({ provider })`
- `oauth2.link()` replaced by `linkSocial()`
- Callback URL changed from `/api/auth/oauth2/callback/:id` to `/api/auth/callback/:id`
- `genericOAuthClient()` deprecated (no longer needed)
- `pkce` defaults to `true` (was `false`); set `pkce: false` for providers that reject PKCE
- `authorizationUrlParams` and `tokenUrlParams` only accept `Record<string, string>`
- `issuer` and `requireIssuerValidation` config fields removed; issuer validation is automatic via OIDC discovery
- `mapProfileToUser` profile typed as `OAuth2UserInfo & Record<string, unknown>`
