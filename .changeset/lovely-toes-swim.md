---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

harden dynamic `baseURL` resolution for direct `auth.api` calls

- Resolve `baseURL` per call from forwarded `request`/`headers`, matching the HTTP handler path.
- Throw `APIError` with a clear message when a direct call can't be resolved (no source and no `fallback`), instead of silently leaving `baseURL` empty.
- Convert `allowedHosts` mismatch to `APIError` on the direct-API path.
- Cross-realm `Request` inputs now produce a `Response` consistently.
- Pass a synthesized `Request` to user-defined `trustedOrigins(req)` and `trustedProviders(req)` callbacks on the headers-only path so they always see `req.headers`.
- Infer `http` for loopback hosts on the headers-only protocol fallback so local-dev direct calls don't silently diverge from the HTTP handler's scheme.
- `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`, `oAuthDiscoveryMetadata`, and `oAuthProtectedResourceMetadata` forward the incoming request to the chained `auth.api` call, so `issuer` and discovery URLs reflect the request host.
- `withMcpAuth` forwards the incoming request to `getMcpSession` and threads `trustedProxyHeaders` when resolving the `WWW-Authenticate` metadata URL.
