---
"@better-auth/oauth-provider": minor
---

Add an OAuth Provider extension surface so companion plugins can register token grants, assertion-based client authentication methods, additive discovery metadata, access-token/ID-token/UserInfo claim contributors, and client-id discovery sources without changing provider core for each OAuth RFC. Register through `extendOAuthProvider(ctx, extension)` in a plugin `init()` hook.

Contributions are guarded: grant types, auth methods, and assertion types must be disjoint across extensions; metadata and claims are additive and never override authorization-server core. Assertion-based client authentication methods can reuse the exported `consumeClientAssertion` helper for the RFC 7523 audience, lifetime, and `jti` replay checks.

Client-id discovery is contributed through this surface as an extension field rather than a separate top-level option. A plugin that resolves clients from an external source registers it with `extendOAuthProvider(ctx, { clientDiscovery })`; to compose one directly, pass `oauthProvider({ extensions: [{ clientDiscovery }] })`.
