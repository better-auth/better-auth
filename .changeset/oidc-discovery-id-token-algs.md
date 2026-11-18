---
"@better-auth/oauth-provider": patch
---

`id_token_signing_alg_values_supported` in the OpenID Connect discovery document now lists only the algorithm ID tokens are signed with, which is the JWT plugin's primary `keyPairConfig.alg` (`HS256` when `disableJwtPlugin` is set). Before, it also listed every algorithm declared in `jwks.keyPairConfigs`, which only sign access tokens for resources that pin a `signingAlgorithm`. A client that picked an algorithm from this list could choose one that ID tokens never use.
