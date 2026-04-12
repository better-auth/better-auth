---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

fix dynamic `baseURL` for direct `auth.api` calls and plugin metadata helpers

**Direct `auth.api.*` calls**

- Resolve `baseURL` per call from forwarded `request` / `headers`, matching the HTTP handler path.
- Throw `APIError` with a clear message when the baseURL can't be resolved (no source and no `fallback`), instead of leaving `ctx.context.baseURL = ""` for downstream plugins to crash on.
- Convert `allowedHosts` mismatches on the direct-API path to `APIError`.
- `resolveRequestContext` rehydrates `trustedOrigins`, `trustedProviders`, and cookies per call. User-defined `trustedOrigins(req)` / `trustedProviders(req)` callbacks receive a `Request` synthesized from forwarded headers when needed.
- Infer `http` for loopback hosts on the headers-only protocol fallback so local-dev calls don't silently resolve to `https://localhost:3000`.
- Cross-realm `Request` inputs return a `Response` consistently (the `hasRequest` check uses `isRequestLike`, which also rejects objects that spoof `Symbol.toStringTag` without the real shape).

**Plugin metadata helpers**

- `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`, `oAuthDiscoveryMetadata`, and `oAuthProtectedResourceMetadata` forward the incoming request to their chained `auth.api` calls, so `issuer` and discovery URLs reflect the request host on dynamic configs.
- `withMcpAuth` forwards the incoming request to `getMcpSession`, threads `trustedProxyHeaders`, and emits a bare `Bearer` challenge when `baseURL` can't be resolved (instead of `Bearer resource_metadata="undefined/..."`).
- `metadataResponse` in `@better-auth/oauth-provider` normalizes headers via `new Headers()` so callers can pass `Headers`, tuple arrays, or records without silently dropping entries.
