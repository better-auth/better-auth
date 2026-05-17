---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
"@better-auth/sso": patch
---

Harden `private_key_jwt` and token endpoint client authentication after the initial landing.

- `client_secret_basic` now percent-encodes `clientId` and `clientSecret` before base64-encoding the Basic credential, per RFC 6749 §2.3.1. Credentials containing reserved characters now authenticate against spec-compliant servers.
- `signPrivateKeyJwtClientAssertion` rejects JWKs whose embedded `alg` is not an asymmetric algorithm supported for `private_key_jwt` (e.g. `HS256`, `none`), instead of silently signing with a disallowed algorithm.
- OAuth Provider registration rejects `jwks` payloads with zero keys (both `jwks: []` and `jwks: { keys: [] }`). An empty JWKS previously registered and only failed later at authentication.
- SSO `private_key_jwt` flow now redirects with `error_description=no_private_key_available` when `resolvePrivateKey` returns no `privateKeyJwk` or `privateKeyPem`, instead of falling through to an internal `private_key_jwt requires…` error during signing.
