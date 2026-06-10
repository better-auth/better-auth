---
"better-auth": minor
---

genericOAuth providers configured with a `discoveryUrl` now verify the provider's `id_token` against its published JWKS (signature, issuer, audience, and advertised algorithms). A sign-in whose `id_token` fails verification is rejected.

These providers also accept client-submitted id_token sign-in through `signIn.social({ idToken })`, which previously returned `ID_TOKEN_NOT_SUPPORTED`.

Providers configured with explicit endpoints instead of `discoveryUrl` are unchanged.
