---
"@better-auth/oauth-provider": minor
---

A `clientAuthentication` strategy now receives `acceptedAudiences`, the client assertion audiences the provider accepts under `assertionAudience`. Pass it to `consumeClientAssertion`, which now takes `acceptedAudiences` and applies the same audience rule as the built-in `private_key_jwt` method.

The `expectedAudience` strategy input and the `expectedAudience` parameter of `consumeClientAssertion` are deprecated. A strategy that checks `aud` against the endpoint URL accepts different audiences than the built-in method does.
