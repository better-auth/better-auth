---
"@better-auth/core": minor
"better-auth": minor
---

Social providers now accept `tokenEndpoint`, `userInfoEndpoint`, and `jwksEndpoint` next to `authorizationEndpoint`, so you can point a provider at a local OAuth emulator or a sandbox. WeChat also accepts `refreshTokenEndpoint`. The `tokenEndpoint` override is the audience of a `private_key_jwt` client assertion, and `jwksEndpoint` changes only where ID token signing keys come from, so the provider's own issuer is still required.
