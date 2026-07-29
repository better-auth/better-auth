---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

harden dynamic `baseURL` handling for direct `auth.api.*` calls and plugin metadata helpers

**Direct `auth.api.*` calls**

- Throw `APIError` with a clear message when the baseURL can't be resolved (no source and no `fallback`), instead of leaving `ctx.context.baseURL = ""` for downstream plugins to crash on.
- Convert `allowedHosts` mismatches on the direct-API path to `APIError`.
- Honor `advanced.trustedProxyHeaders` on the dynamic path (default `true`, unchanged). Previously `x-forwarded-host` / `-proto` were unconditionally trusted with `allowedHosts`; they now go through the same gate as the static path. The default flip to `false` ships in a follow-up PR.
- `resolveRequestContext` rehydrates `trustedProviders` and cookies per call (in addition to `trustedOrigins`). User-defined `trustedOrigins(req)` / `trustedProviders(req)` callbacks receive a `Request` synthesized from forwarded headers when no full `Request` is available.
- Infer `http` for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`) on the headers-only protocol fallback, so local-dev calls don't silently resolve to `https://localhost:3000`.
- `hasRequest` uses `isRequestLike`, which now rejects objects that spoof `Symbol.toStringTag` without a real `url` / `headers.get` shape.

**Plugin metadata helpers**

- `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`, `oAuthDiscoveryMetadata`, and `oAuthProtectedResourceMetadata` forward the incoming request to their chained `auth.api` calls, so `issuer` and discovery URLs reflect the request host on dynamic configs.
- `requireMcpAuth` reads the resolved Better Auth base URL from the auth context for its default issuer, resource, and JWKS URL. It throws a clear configuration error when the base URL cannot be resolved; resource servers with dynamic base URLs use `mcpHandler` with explicit verification options.
- `metadataResponse` in `@better-auth/oauth-provider` normalizes headers via `new Headers()` so callers can pass `Headers`, tuple arrays, or records without silently dropping entries.
