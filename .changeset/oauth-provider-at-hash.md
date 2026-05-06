---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

feat(oauth-provider): compute `at_hash` in ID tokens per OIDC Core §3.1.3.6

ID tokens issued alongside an access token now include the `at_hash` claim, which cryptographically binds the two tokens to prevent token substitution attacks. The hash algorithm is selected based on the actual signing key's algorithm (EdDSA/Ed25519 uses SHA-512, RS/ES/PS384 uses SHA-384, RS/ES/PS512 uses SHA-512, all others use SHA-256).

A new `resolveSigningKey()` export is available from `better-auth/plugins` to resolve the current JWKS signing key (including its algorithm). When using a custom `jwt.sign` callback, the signed ID token's header is validated against the declared algorithm to prevent `at_hash` mismatches.
