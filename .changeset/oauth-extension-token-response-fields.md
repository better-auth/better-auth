---
"@better-auth/oauth-provider": minor
---

Provider extensions can add fields to the token response with `tokenResponseFields`, without the app wiring `customTokenResponseFields`.

A companion plugin can now return its own field with the tokens, such as a session handle for a later request. The callback receives the same input as `beforeTokenIssuance` and runs after it, for every grant, before any token is stored. The nine fields the provider owns, including `access_token`, `scope`, `issued_token_type`, and `authorization_details`, are left out with a warning. When two extensions add the same field, the first one registered keeps it, and the `customTokenResponseFields` option overrides both.
