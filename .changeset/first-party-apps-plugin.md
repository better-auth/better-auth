---
"@better-auth/first-party-apps": minor
---

Add `@better-auth/first-party-apps`, so your own native and CLI apps can sign users in with a native form instead of a browser redirect (draft-ietf-oauth-first-party-apps-04). The app posts the user's credentials to `/oauth2/authorize-challenge`, receives an authorization code, and redeems it at `/oauth2/token` with PKCE and without `redirect_uri`. Discovery advertises `authorization_challenge_endpoint`.

Only clients an admin creates with `metadata: { first_party_app: true }` and `skip_consent` can use the endpoint; dynamic registration cannot opt a client in. Credentials are checked by strategies, and `passwordStrategy()` signs users in with email and password, asks for a TOTP or backup code when two-factor authentication is on, checked with the two-factor plugin so failures share its account lockout, and sends the user to the browser when the app cannot finish. Each `auth_session` is stored hashed and bound to its client and DPoP key. Failed attempts are limited per `auth_session`, per account and method, and per client. `requireStepUp` refuses a grant at the token endpoint with `insufficient_authorization` until the user authenticates again.

The plugin adds `firstPartyAuthSession` and `firstPartyAuthFailure` tables. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
