---
"@better-auth/oauth-provider": minor
---

Add an OAuth Provider extension surface so companion plugins can register token grants, assertion-based client authentication methods, additive discovery metadata, access-token/ID-token/UserInfo claim contributors, and client-id discovery sources without changing provider core for each OAuth RFC. Register through `extendOAuthProvider(ctx, extension)` in a plugin `init()` hook.

Contributions are guarded: grant types, auth methods, and assertion types must be disjoint across extensions; metadata and claims are additive and never override authorization-server core. Assertion-based client authentication methods can reuse the exported `consumeClientAssertion` helper for the RFC 7523 audience, lifetime, and `jti` replay checks.

Plugins reach provider capabilities through one surface. A grant handler receives a `provider` (resolve a client, issue tokens, hash or look up a token, verify a token), and a plugin's own endpoints obtain the same object with `getOAuthProviderApi(ctx, opts, grantType?)`. An issued token can be sender-constrained by passing a `confirmation` (RFC 7800 `cnf`) to `issueTokens` or returning it from a client-authentication strategy; the authorization server owns `cnf`, so a claim contributor cannot set it.

Client-id discovery is contributed through this surface: a plugin that resolves clients from an external source registers it with `extendOAuthProvider(ctx, { clientDiscovery })`, or composes one directly via `oauthProvider({ extensions: [{ clientDiscovery }] })`.
