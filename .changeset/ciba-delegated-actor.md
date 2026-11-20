---
"@better-auth/ciba": minor
---

CIBA can now issue delegated access tokens that name the user as `sub` and an agent or other actor as the RFC 8693 `act` claim.

Return the actor from the new `resolveActor` option, which runs at `/oauth2/bc-authorize` after the client authenticates and the user is found. Return only an actor your server has verified, such as the authenticated client, and set `sub_profile: "service"` on a client or agent actor so pairwise clients do not read its `sub` as a pairwise subject. Throw an `APIError` from `resolveActor` to refuse the request. `sendNotification` receives the actor as `actor`, and the consent page receives it as JSON in the `actor` query parameter. A JWT access token carries `act`, and introspection of an opaque access token returns it. A delegated token gets no refresh token, and its returned `scope` leaves out `offline_access`. Without `resolveActor`, tokens are issued as before.

The `cibaRequest` model has a new `actor` column. Run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.
