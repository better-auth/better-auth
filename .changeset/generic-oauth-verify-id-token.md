---
"better-auth": minor
---

genericOAuth providers configured with a `discoveryUrl` now verify the provider's `id_token` against its published JWKS (signature, issuer, audience, and advertised algorithms) and bind it to the authorization request with a server-generated OIDC `nonce`. A sign-in whose `id_token` fails verification, or does not echo the expected `nonce`, is rejected.

Set `disableIdTokenNonceBinding: true` on a provider that does not return the `nonce` claim in the authorization-code flow.

These providers also accept client-submitted id_token sign-in through `signIn.social({ idToken })`, which previously returned `ID_TOKEN_NOT_SUPPORTED`.

Providers configured with explicit endpoints instead of `discoveryUrl` are unchanged.
