---
"@better-auth/ciba": minor
---

Add `@better-auth/ciba`, OpenID Connect Client-Initiated Backchannel Authentication (CIBA) for `oauthProvider()`. A client that knows who it is acting for, such as an AI agent or a support tool, asks for a user by `login_hint` at `/oauth2/bc-authorize`. Your `sendNotification` callback sends that user a link, the user approves or denies on your existing sign-in and consent pages, and the client collects tokens at `/oauth2/token`, either by polling or after the server calls it back (`deliveryModes: ["poll", "ping"]`).

Consent is always shown, only the user the client named can decide, and your consent page receives the client's `binding_message` to display. Clients register `backchannel_token_delivery_mode`, and for ping `backchannel_client_notification_endpoint`, through dynamic registration, a client metadata document, or admin client creation, and registration rejects unsupported values. Public clients such as agents can take part with `allowPublicClients`; they send `client_id` in the form body and should bind their tokens with DPoP. `resolveUser` receives the requesting client, so with open registration you can accept only identifiers that client was already given.

The plugin adds a `cibaRequest` table. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
