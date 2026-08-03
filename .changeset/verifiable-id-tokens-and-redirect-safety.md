---
"better-auth": patch
"@better-auth/oauth-provider": patch
"@better-auth/sso": patch
---

MCP id tokens are signed with the jwt plugin's published key and discovery points at the JWKS that serves it, so a client can verify the token it receives; a public client, which holds no secret to verify with, now receives no id token instead of an unverifiable one. MCP also requires PKCE for public clients regardless of `requirePKCE`, and exports `MCPOptions`.

The signed OAuth query carries a url-safe signature, so an intermediary decoding the URL once can no longer invalidate it, and the oauth-provider claim callbacks report configured `additionalFields` with their declared types.

SAML logins read `InResponseTo` where the login extractor places it, so InResponseTo replay validation runs and `allowIdpInitiated: false` accepts genuine SP-initiated logins. SSO error redirects merge their parameters into the target URL instead of concatenating them, preserving any query the URL already carried and encoding values.

`customSession` propagates session lookup failures rather than reporting them as `null`, which callers read as "not signed in". Verification reservations stay unique under `advanced.database.generateId: "uuid"`, so replay markers work. The generic email-OTP endpoints refuse `change-email`, which they could never read or write correctly. Deleting an organization clears the session's active organization only once the delete succeeds.
