---
"@better-auth/oauth-provider": patch
---

DPoP proofs are accepted again for two setups that broke in v1.7.9:

- Plugin endpoints with route params, such as `/extension/:tenant/token`, that issue tokens with a DPoP proof. A valid proof for `/extension/acme/token` was rejected with `invalid_dpop_proof`, because the expected `htu` contained the literal `:tenant`.
- Token and UserInfo requests to a URL with a trailing slash, such as `/api/auth/oauth2/token/`, when `advanced.skipTrailingSlashes` is on. The proof was rejected because the expected `htu` dropped the slash.

The expected `htu` still takes its origin and base path from `baseURL`, so keep `baseURL` set to the public URL clients call. Other setups are unaffected.
