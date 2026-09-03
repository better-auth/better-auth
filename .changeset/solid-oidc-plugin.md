---
"better-auth": minor
---

Add a Solid-OIDC plugin for authenticating users against a Solid Protocol Server. `solidOidc()` registers one social provider per configured server, so sign-in goes through the standard `signIn.social` endpoint with no client plugin.

Solid identities need three things a plain OpenID Connect client does not do, and the plugin handles all of them. Token requests carry an RFC 9449 DPoP proof, and the key each refresh token is bound to is stored encrypted so the refresh grant can replay it. Accounts are keyed by the WebID from the `webid` claim rather than the provider's local subject, so a person keeps one account across pods. And a WebID hosted outside the server is only accepted once its profile document names that server under `solid:oidcIssuer`, which stops a configured server from asserting a WebID it has no authority over.

Clients that were never pre-registered are supported too: the plugin serves each server's Client Identifier Document at `/solid/client-id/<providerId>` and uses that URL as the `client_id`. A statically registered client can be used instead with `clientIdDocument: false`.

Adding the plugin introduces the `solidDpopKey` table, so run a migration before using it.
