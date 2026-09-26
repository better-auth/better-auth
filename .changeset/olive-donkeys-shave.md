---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Let the resource-server verification entry points (`verifyBearerToken`, `verifyAccessTokenRequest`, and the `oauthProviderResourceClient` actions) take an in-process JWKS source.

`jwksUrl` now accepts `() => Promise<JSONWebKeySet | undefined>` in addition to a URL string, and the new `jwksCacheKey` option caches a function source's key set under a stable object, with the same five-minute TTL and `kid`-miss refetch rules a string source already had. A resource server co-located with the authorization server can hand over the key set it already holds in process instead of making a network round trip to *its own* `{baseURL}{basePath}/jwks`. String `jwksUrl` values are unaffected: they are still fetched over HTTP and cached by url, and the function form's advantage is that it skips the network hop entirely and adds no url-keyed cache entry. `jwksCacheKey` is ignored for string sources.

A function source's cache entry is scoped to the issuer it was read for, so one `jwksCacheKey` may be shared across issuers and audiences and each keeps its own entry. Without a `jwksCacheKey`, a function source is read on every verification.

The MCP entry points, `requireMcpAuth` and the MCP protected-request handler, deliberately keep `jwksUrl?: string` and do not accept a function source or a `jwksCacheKey`; widening them is deferred to a follow-up.
