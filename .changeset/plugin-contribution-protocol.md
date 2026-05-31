---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/oauth-provider": minor
---

Add a plugin contribution protocol so plugins can extend the oauth-provider without changing better-auth. A plugin declares `contributes: { "oauth-provider": { ... } }` (typed via the host-augmented `ContributionContracts` interface) plus an optional `requires` list validated at startup, and the host collects them with `ctx.getContributions(...)` in its init.

The oauth-provider now consumes those contributions. The token endpoint dispatches plugin-registered custom grant types, the discovery documents advertise contributed grant URIs, metadata, and token-endpoint auth methods, and minted access and ID tokens include plugin-contributed claims. The grant-author helpers (`createUserTokens`, `validateClientCredentials`, `basicToClientCredentials`, `getClient`, `storeToken`) and the `OAuthContributions` contract type are now exported so grant types like CIBA, OIDC4VCI, and token exchange can ship as external packages.

A custom grant handler can inject per-request claims and response fields through the `extra` option on `createUserTokens` (its `CreateUserTokensParams` type is now exported): `extra.accessTokenClaims` merge into the JWT access token and `extra.tokenResponse` into the response body, both beneath the host's pinned fields. Plugins can also register token-endpoint client-authentication methods through `OAuthContributions.clientAuthStrategies`, keyed by `client_assertion_type`, so a method such as wallet attestation becomes executable rather than only advertised.

The token endpoint's `grant_type` parameter now accepts any registered grant URI instead of a fixed enum. An unknown grant type returns an OAuth `unsupported_grant_type` error response rather than a schema-validation error; valid requests for the built-in grants are unaffected.

Plugin-contributed claims can never override the host's registered or authentication-context claims; on the ID token this includes `acr` and `auth_time`. Contributed access-token claims are also surfaced when an opaque token is read through introspection, matching the JWT path. Conflicting contributions fail at startup: two plugins registering the same grant URI, a grant URI advertised without a handler (or a handler not advertised), and a grant type that is not an absolute URI all throw.
