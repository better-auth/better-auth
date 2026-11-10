---
"@better-auth/oauth-provider": patch
---

Resource servers that pass `auth` to `oauthProviderResourceClient(auth)` and rely on its defaults now accept the access tokens the OAuth provider issues when `baseURL` is only an origin, such as `https://example.com`. Previously the default issuer left out the auth path (`/api/auth` by default), and when `basePath` was not set the default JWKS and introspection URLs left it out too, so valid tokens failed verification unless `issuer` and `jwksUrl` were passed explicitly. The default audience and protected resource metadata now use the same base URL. Explicitly passed options and the JWT plugin's `jwt.issuer` and `jwks.remoteUrl` still take precedence.
