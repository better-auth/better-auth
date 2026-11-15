---
"@better-auth/oauth-provider": minor
---

A `clientAuthentication` strategy now receives `acceptedAudiences`, the client assertion audiences the provider accepts under `assertionAudience`. Pass it to `consumeClientAssertion`, which now takes `acceptedAudiences` and applies the same audience rule as the built-in `private_key_jwt` method.

The `expectedAudience` strategy input and the `expectedAudience` parameter of `consumeClientAssertion` are deprecated. `consumeClientAssertion` treats an `expectedAudience` as the endpoint it names and applies `assertionAudience`, so under the default it accepts only the issuer. A strategy that compares `aud` with `expectedAudience` itself still accepts the endpoint URL, so move it to `acceptedAudiences`.
