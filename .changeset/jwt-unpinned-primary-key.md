---
"better-auth": patch
---

Tokens signed without a pinned algorithm, such as ID tokens and session JWTs, now prefer a key for `jwks.keyPairConfig.alg`. Before, if the first signature on an empty key set pinned an algorithm listed in `jwks.keyPairConfigs`, later unpinned tokens reused that key instead of creating one for the primary algorithm. An existing key whose algorithm is not listed in `jwks.keyPairConfigs` is still reused.
