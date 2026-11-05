---
"@better-auth/oauth-provider": minor
---

If you set a `reference_id` claim on access tokens yourself, through `customAccessTokenClaims`, an extension, or a resource's `customClaims`, it is now dropped with a warning, because the provider sets this claim itself. Rename your claim to keep sending it. When `postLogin.consentReferenceId` returns a consent reference, such as an organization, JWT access tokens now include it as `reference_id`, and introspection returns it. Setups that use neither see no change to their tokens.

Services that receive a user's access token, such as an MCP server or a backend for frontend, can now exchange it for an access token to another registered API with OAuth 2.0 Token Exchange (RFC 8693), instead of forwarding the user's token. Add `oauthTokenExchange()` next to `oauthProvider()` and register the service as a confidential client with the `TOKEN_EXCHANGE_GRANT_TYPE` grant. The exchanged token represents the same user and keeps the consent reference, such as the organization, the user approved. It is limited to the subject token's scopes and never outlives the subject token. Delegation (`actor_token`) and refresh tokens for exchanged tokens are not supported yet.

Extension authors can pass `maxExpiresAt` to `issueTokens` to cap when the access token expires.
