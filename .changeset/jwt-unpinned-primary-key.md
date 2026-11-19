---
"better-auth": patch
---

Tokens signed without a pinned algorithm, such as ID tokens and session JWTs, now prefer a key for `jwks.keyPairConfig.alg`. Before, if the first signature on an empty key set pinned an algorithm listed in `jwks.keyPairConfigs`, later unpinned tokens reused that key instead of creating one for the primary algorithm. An existing key whose algorithm is not listed in `jwks.keyPairConfigs` is still reused.

A deployment already in the affected state, where the newest key is for a non-primary `jwks.keyPairConfigs` algorithm, creates a key for `jwks.keyPairConfig.alg` on its next unpinned signature. This includes a deployment whose old primary algorithm moved into `jwks.keyPairConfigs`, and one whose custom `adapter.getJwks` keyring has no key for the primary algorithm. ID tokens, `/token` JWTs, and cookie-cache JWTs then change `alg` and `kid`. Earlier tokens keep verifying by `kid`, but verifiers that hard-code the old algorithm, or never refetch the JWKS for an unknown `kid`, must adapt.
