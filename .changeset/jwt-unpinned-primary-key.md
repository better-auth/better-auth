---
"better-auth": patch
---

Tokens signed without a pinned algorithm, such as ID tokens and session JWTs, now prefer a key for `jwks.keyPairConfig.alg`. Before, if the first signature on an empty key set pinned an algorithm listed in `jwks.keyPairConfigs`, later unpinned tokens reused that key instead of creating one for the primary algorithm. An existing key whose algorithm is not listed in `jwks.keyPairConfigs` is still reused.

A deployment already in the affected state, with no key for `jwks.keyPairConfig.alg` and a newest key for another `jwks.keyPairConfigs` algorithm, creates a key for `jwks.keyPairConfig.alg` on its next unpinned signature. This includes a deployment whose old primary algorithm moved into `jwks.keyPairConfigs`. A deployment that already has a key for `jwks.keyPairConfig.alg` keeps its current `alg` and `kid`. ID tokens, `/token` JWTs, and cookie-cache JWTs of an affected deployment then change `alg` and `kid`. Earlier tokens keep verifying by `kid`, but verifiers that hard-code the old algorithm, or never refetch the JWKS for an unknown `kid`, must adapt. A custom `adapter.getJwks` keyring is unchanged: unpinned tokens keep using its newest key, and no key is created for it.
