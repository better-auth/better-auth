---
"better-auth": patch
"@better-auth/core": patch
---

Generic OAuth providers configured with `authorizationHeaders` now send those headers when refreshing an access token, not only when exchanging the authorization code. Before, a provider whose token endpoint requires one of those headers accepted the sign-in but rejected every refresh. Providers without `authorizationHeaders` are unaffected.

`refreshAccessToken` and `refreshAccessTokenRequest` from `@better-auth/core/oauth2` accept an optional `headers` input for providers that need extra headers on refresh. Client authentication headers still take precedence over it.

Extra headers whose names differ only in case from a client authentication header, such as `Authorization` with `authentication: "basic"`, no longer produce a combined, invalid header on the code exchange or refresh. Client authentication replaces them, including headers a custom `tokenEndpointAuth` hook sets in any casing.
