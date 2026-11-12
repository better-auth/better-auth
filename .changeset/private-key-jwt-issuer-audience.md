---
"@better-auth/core": minor
"better-auth": minor
---

`private_key_jwt` client assertions can now use the authorization server's issuer as the audience, as FAPI 2.0 and RFC 10070 require.

Pass `audience: "issuer"` to `createPrivateKeyJwtClientAssertionGetter`. The default stays the token endpoint URL, so existing providers keep working. Generic OAuth providers configured with `discoveryUrl` pass the discovered issuer to every client assertion, including custom `getClientAssertion` functions, which receive it as `issuer`. A provider without a discovered issuer fails each token request and pushed authorization request when `audience: "issuer"` is set, instead of falling back to the token endpoint.
