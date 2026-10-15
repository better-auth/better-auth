---
"@better-auth/oauth-provider": minor
---

`oauthProvider()` accepts a new `authenticationContext` option that sets the `acr` and `amr` claims in ID tokens. List the classes you issue in `acrValuesSupported`, which discovery advertises as `acr_values_supported`, and return the current session's `acr` and `amr` from `resolve`. Previously every ID token carried `acr: "0"` and no `amr`, and that is still the default.

With a resolver, a request whose essential `claims.id_token.acr` the session does not satisfy fails with `access_denied`. A voluntary request through `acr_values` continues and the ID token reports the session's current `acr`. A resolver that returns an `acr` outside `acrValuesSupported`, or an `amr` that is not a string array, fails the authorization with `server_error`. ID tokens from refreshed tokens keep the `acr` and `amr` of the original authorization.

This release adds optional `acr` and `amr` columns to the `oauthRefreshToken` table, which every `oauthProvider()` setup needs. Apply them before deploying: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
