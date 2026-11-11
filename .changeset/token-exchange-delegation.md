---
"@better-auth/oauth-provider": minor
---

`oauthTokenExchange()` now supports RFC 8693 delegation. A service can send an `actor_token` with `actor_token_type=urn:ietf:params:oauth:token-type:access_token`. The exchanged token then names the actor in an `act` claim, nesting earlier actors from the subject token. Introspection returns `act` for JWT and opaque access tokens. Before, any request with `actor_token` failed with `invalid_request`.

The actor token must be an active access token this server issued to the exchanging client, such as the service's own `client_credentials` token. A delegated token, one that already carries `act`, cannot be an actor token. A subject token with a `may_act` claim can only be exchanged by an actor that matches it. `delegation.maxDepth` limits the number of actors and defaults to `1`. Set it to `0` to keep rejecting actor tokens. `allowExchange` now also receives `actor` and `act`, and `delegation.actorClaims` adds your own fields to the current actor's entry.

Introspection now reports an opaque access token inactive when its user no longer exists. Before, adapters without foreign keys, such as MongoDB, returned it as active without a `sub`.

**Breaking for claim contributors:** `act` is now owned by the authorization server, like `cnf`. A value set by `customAccessTokenClaims`, an extension `claims.accessToken` contributor, or a resource's `customClaims` is stripped with a warning. Custom grants can pass `act` to `issueTokens` instead.

**Migration required:** opaque delegated tokens store their actor chain in a new optional `act` column on `oauthAccessToken`. Run `npx auth@latest migrate` or `npx auth@latest generate` before upgrading.
