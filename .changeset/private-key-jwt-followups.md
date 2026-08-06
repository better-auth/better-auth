---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": patch
"@better-auth/sso": patch
---

Harden `private_key_jwt` and token endpoint client authentication, and add the helpers that make the fix structural.

`@better-auth/core/oauth2` now exposes `encodeBasicCredentials` and `decodeBasicCredentials`, a round-trip-tested pair that follows RFC 6749 §2.3.1 (`application/x-www-form-urlencoded` each value, split on the first `:` only). The decoder accepts the scheme case-insensitively and tolerates one or more spaces before the credentials per RFC 7235 §2.1. `client_secret_basic` on the client side and the Better Auth OAuth provider on the server side both go through these helpers, so credentials containing reserved characters round-trip cleanly across the stack and headers like `basic xxx` or `Basic  xxx` are accepted.

`createPrivateKeyJwtClientAssertionGetter` validates options eagerly. Unsupported algorithms (`HS256`, `none`), a JWK with no key material, and disagreement between an explicit `algorithm` and the JWK-embedded `alg` all throw at construction rather than on the first token request. `signPrivateKeyJwtClientAssertion` enforces the same checks for direct callers. **Breaking:** configurations that paired an unsupported JWK `alg` with a different explicit `algorithm` used to silently sign with the explicit option; they now fail at construction.

**Breaking:** `@better-auth/oauth-provider` accepts client `jwks` metadata only as an RFC 7517 JWK Set object with a non-empty `keys` array. Replace `jwks: [key]` with `jwks: { keys: [key] }` in DCR payloads, administrative and user client creation, Client ID Metadata Documents, test fixtures, and generated client code. Remotely fetched `jwks_uri` responses must use the same object shape. EC keys must use P-256, P-384, or P-521; OKP keys must use Ed25519. When a key declares `alg`, it must be a supported `private_key_jwt` algorithm that matches the key type and curve; omit `alg` when the client chooses the algorithm in its assertion header. OAuth client rows previously written through `oauthToSchema` are already stored as JWK Set objects, so this is a request, configuration, and type migration rather than another database rewrite; audit rows written outside Better Auth separately.

The SSO `private_key_jwt` flow redirects with `error_description=no_private_key_available` when a `resolvePrivateKey` callback returns no `privateKeyJwk` or `privateKeyPem`. The redirect path previously short-circuited only when the resolver was absent entirely; an empty resolver return fell through into an internal signing error.

`better-auth/test` adds `getHttpTestInstance`, a counterpart to `getTestInstance` that binds a real HTTP listener on an OS-assigned port and constructs the auth instance against the discovered URL. It removes the temp-server-then-rebind race that test files have been individually copy-pasting.
