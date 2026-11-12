---
"@better-auth/oauth-provider": minor
---

The OAuth provider can now serve pushed authorization requests (RFC 9126). Set `pushedAuthorizationRequests: { enabled: true }` on `oauthProvider()`, and clients can send their authorization parameters to `POST /oauth2/par` with their usual client authentication. The endpoint validates them as `/oauth2/authorize` would and returns a `request_uri` that expires after 60 seconds by default, works once, and works only for that client. Discovery advertises `pushed_authorization_request_endpoint`. A DPoP proof sent with the push binds the authorization code to that key (RFC 9449 §10.1).

To require pushed requests, set `required: true` for every client, or register a client with `require_pushed_authorization_requests: true`. A plain authorization request then fails with `invalid_request`, while login, consent, and other screens keep working. When you also use `requestUriResolver`, the authorize endpoint looks up values that `/oauth2/par` issued first and calls your resolver for any other value.

The per-client policy adds a `requirePushedAuthorizationRequests` column to the `oauthClient` table, even if you leave PAR off. Apply it before deploying, because requests fail until the column exists: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
