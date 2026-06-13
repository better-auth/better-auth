---
"@better-auth/oauth-provider": minor
---

Add a minimal OAuth Provider extension surface so companion plugins can register token grants, assertion-based client authentication methods, additive discovery metadata, token/UserInfo claim contributors, and client-id discovery sources without changing provider core for each OAuth RFC.

Client-id discovery is contributed through this surface as an extension field rather than a separate top-level option. A plugin that resolves clients from an external source registers it with `extendOAuthProvider(ctx, { clientDiscovery })`; to compose one directly, pass `oauthProvider({ extensions: [{ clientDiscovery }] })`.
