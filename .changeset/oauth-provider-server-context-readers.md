---
"@better-auth/oauth-provider": minor
---

The `serverContext` docs for `issueAuthorizationCode` now list every callback that reads it when a code is redeemed: a provider extension's `beforeTokenIssuance` and `tokenResponseFields`, the `beforeTokenIssuance` option, and `customTokenResponseFields`.
