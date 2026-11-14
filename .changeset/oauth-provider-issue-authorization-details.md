---
"@better-auth/oauth-provider": minor
---

Extension grants can now pass RFC 9396 `authorizationDetails` to `issueTokens`, and the provider issues them as `authorization_details` in the token response, in a JWT access token, and at introspection of an opaque access token.

A detail with `locations` goes only to a token for one of those resources. `customAccessTokenClaims` and a resource's `customClaims` cannot replace the details. An issuance with details gets no refresh token, because refreshed tokens would not carry them. The new `OAuthAuthorizationDetail` type describes one detail.
