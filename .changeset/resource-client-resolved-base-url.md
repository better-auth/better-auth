---
"@better-auth/oauth-provider": patch
---

Resource servers that pass `auth` to `oauthProviderResourceClient(auth)` and rely on its defaults now accept the access tokens the OAuth provider issues. Previously, when `baseURL` was only an origin (such as `https://example.com`) or `basePath` was left at its default, the default issuer and JWKS URL left out `/api/auth`, so valid tokens failed verification unless `issuer` and `jwksUrl` were passed explicitly. The defaults for the audience, the introspection URL, and the protected resource metadata now use the same base URL. Explicitly passed options and the JWT plugin's `jwt.issuer` and `jwks.remoteUrl` still take precedence.
