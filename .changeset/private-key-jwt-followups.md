---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": patch
"@better-auth/sso": patch
---

Harden `private_key_jwt` and token endpoint client authentication, and add the helpers that make the fix structural.

`@better-auth/core/oauth2` now exposes `encodeBasicCredentials` and `decodeBasicCredentials`, a round-trip-tested pair that follows RFC 6749 §2.3.1 (percent-encode each value, split on the first `:` only). `client_secret_basic` on the client side and the Better Auth OAuth provider on the server side both go through these helpers, so credentials containing reserved characters now round-trip cleanly across the stack.

`signPrivateKeyJwtClientAssertion` rejects a JWK whose embedded `alg` is not asymmetric (e.g. `HS256`, `none`), and throws on conflict when an explicit `algorithm` option disagrees with the JWK-embedded `alg`. The previous behavior silently let the explicit option win. **Breaking:** configurations that paired an HS-flavored JWK with an RS-flavored explicit option now fail at construction time.

OAuth Provider DCR rejects empty `jwks` payloads at registration time (`jwks: []` and `jwks: { keys: [] }`). An empty JWKS used to register and only fail later at authentication.

The SSO `private_key_jwt` flow redirects with `error_description=no_private_key_available` when a `resolvePrivateKey` callback returns no `privateKeyJwk` or `privateKeyPem`. The redirect path previously short-circuited only when the resolver was absent entirely; an empty resolver return fell through into an internal signing error.

`better-auth/test` adds `getHttpTestInstance`, a counterpart to `getTestInstance` that binds a real HTTP listener on an OS-assigned port and constructs the auth instance against the discovered URL. It removes the temp-server-then-rebind race that test files have been individually copy-pasting.
