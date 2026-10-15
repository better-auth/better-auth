---
"@better-auth/ciba": minor
---

Add `@better-auth/ciba`, OpenID Connect Client-Initiated Backchannel Authentication (CIBA) in poll mode for `oauthProvider()`. A client that knows who it is acting for, such as an AI agent or a support tool, asks for a user by `login_hint` at `/oauth2/bc-authorize`. Your `sendNotification` callback sends that user a link, the user approves or denies on your existing sign-in and consent pages, and the client polls `/oauth2/token` for tokens.

Consent is always shown, only the user the client named can decide, and your consent page receives the client's `binding_message` to display. Only clients you register with the CIBA grant and `metadata.backchannel_token_delivery_mode: "poll"` can start requests, so clients from open registration cannot send your users sign-in requests.

The plugin adds a `cibaRequest` table. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
