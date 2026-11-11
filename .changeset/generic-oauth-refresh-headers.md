---
"better-auth": patch
"@better-auth/core": patch
---

Generic OAuth providers configured with `authorizationHeaders` now send those headers when refreshing an access token, not only during the default authorization code exchange. A custom `getToken` still adds its own headers to the code exchange. Before, a provider whose token endpoint requires one of those headers accepted the sign-in but rejected every refresh. Providers without `authorizationHeaders` are unaffected.

`refreshAccessToken` and `refreshAccessTokenRequest` from `@better-auth/core/oauth2` accept an optional `headers` input for providers that need extra headers on refresh.
