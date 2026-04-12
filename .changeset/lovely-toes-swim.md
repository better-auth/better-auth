---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

harden dynamic `baseURL` resolution for direct `auth.api` calls

- Resolve `baseURL` per call from forwarded `request`/`headers`, matching the HTTP handler path.
- Scope the resolved `baseURL` through request-state ALS so nested `auth.api.*` calls inherit it without re-resolving.
- Honor `advanced.trustedProxyHeaders` on the dynamic path: `x-forwarded-host` / `x-forwarded-proto` are now ignored unless explicitly enabled. **Breaking change** for dynamic configs that relied on implicit proxy-header trust.
- Throw `APIError` with a clear message when a direct call can't be resolved (no source and no `fallback`), instead of silently leaving `baseURL` empty.
- Convert `allowedHosts` mismatch to `APIError` on the direct-API path.
- Cross-realm `Request` inputs now produce a `Response` consistently.
- `oauthProviderAuthServerMetadata` / `oauthProviderOpenIdConfigMetadata` forward the incoming request to the chained `auth.api` call, so `issuer` reflects the request host.
