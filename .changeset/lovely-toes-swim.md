---
"better-auth": minor
"@better-auth/oauth-provider": minor
---

harden dynamic `baseURL` resolution for direct `auth.api` calls

- Resolve `baseURL` per call from forwarded `request`/`headers`, matching the HTTP handler path.
- Honor `advanced.trustedProxyHeaders` on the dynamic path: `x-forwarded-host` / `x-forwarded-proto` are now ignored unless explicitly enabled. **Breaking change** for dynamic configs that relied on implicit proxy-header trust.
- Throw `APIError` with a clear message when a direct call can't be resolved (no source and no `fallback`), instead of silently leaving `baseURL` empty.
- Convert `allowedHosts` mismatch to `APIError` on the direct-API path.
- Cross-realm `Request` inputs now produce a `Response` consistently.
- `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`, `oAuthDiscoveryMetadata`, and `oAuthProtectedResourceMetadata` forward the incoming request to the chained `auth.api` call, so `issuer` and discovery URLs reflect the request host.
- `withMcpAuth` threads `trustedProxyHeaders` when resolving the `WWW-Authenticate` metadata URL.
