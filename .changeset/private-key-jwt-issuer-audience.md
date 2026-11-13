---
"@better-auth/core": minor
"better-auth": minor
---

Generic OAuth providers can now sign `private_key_jwt` client assertions for the authorization server's issuer, as FAPI 2.0 and RFC 10070 require.

Pass `audience: "issuer"` to `createPrivateKeyJwtClientAssertionGetter`. The default stays the token endpoint URL, so existing providers keep working. The issuer comes from the provider's discovery document, so `audience: "issuer"` works with Generic OAuth providers configured with `discoveryUrl`. Those providers also pass the discovered issuer to custom `getClientAssertion` functions as `issuer`. Other callers of the getter, such as the core token helpers and the SSO plugin, do not supply an issuer yet. When no issuer is supplied, each token request and pushed authorization request fails instead of falling back to the token endpoint.
