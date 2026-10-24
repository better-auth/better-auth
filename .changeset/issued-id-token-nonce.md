---
"better-auth": minor
"@better-auth/core": minor
---

Apps where clients sign in or link accounts with a provider ID token (for example from a native Google or Apple SDK) can now bind each token to one request. Set `requireIssuedIdTokenNonce: true` on a social provider. Clients then fetch a single-use nonce with `authClient.idToken.nonce({ provider })`, pass it to the provider's SDK, and send it with the ID token to `signIn.social` or `linkSocial`. A request without an issued nonce, or reusing one, is rejected with `400 INVALID_ID_TOKEN_NONCE`. The option is off by default, and providers without it behave as before.

One change applies to every provider that uses built-in verification: an opaque (non-JWT) token, such as a Facebook Graph access token, is now rejected when the request also sends a `nonce`, because the token cannot carry one. A custom `verifyIdToken` must compare the nonce to the token's claim itself. Opaque tokens sent without a nonce are still accepted.

Expired verification rows are now also deleted when a single-use value, such as a magic link, an OTP, or an issued nonce, is used. Before, cleanup ran only when a value was looked up. `verification.disableCleanup` turns off both.
