---
"@better-auth/oauth-provider": patch
---

OpenID Connect discovery now advertises the configured primary algorithm in `id_token_signing_alg_values_supported`, or `HS256` with `disableJwtPlugin`. Additional algorithms in `jwks.keyPairConfigs` are for per-resource access token signing. If you supply a custom keyring or signer, match `jwks.keyPairConfig.alg` to the algorithm it uses for ID tokens.
