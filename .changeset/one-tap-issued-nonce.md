---
"better-auth": minor
---

Google One Tap sign-ins can now be bound to a nonce the server issued. Set `requireIssuedIdTokenNonce: true` on `socialProviders.google` and `useIssuedNonce: true` on `oneTapClient`. The client then fetches a single-use nonce before each prompt and button render, and the callback rejects a token without a matching, unused nonce with `400 INVALID_ID_TOKEN_NONCE`. Button mode fetches a new nonce after each sign-in attempt and before the current one expires. Setups with only `oneTap({ clientId })` and no Google provider cannot enable it.

Two changes apply to every One Tap setup:

- The callback rejects a token that carries a `nonce` claim when the request sends no nonce.
- The client's `nonce` action option is deprecated and ignored, with a console warning, and a `nonce` in `additionalOptions` is no longer passed to Google. Before, the server never checked these values. Use `useIssuedNonce` instead.
