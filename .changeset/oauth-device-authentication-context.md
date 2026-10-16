---
"@better-auth/oauth-provider": minor
---

With `oauthDeviceAuthorization()` and an `authenticationContext` resolver, ID tokens from the device code grant now carry the `acr` and `amr` that `resolve` returns when the user approves the device code, and refreshed ID tokens keep them. Previously device-issued ID tokens always reported `acr: "0"` and no `amr`. Setups without `oauthDeviceAuthorization()` are unaffected.

This adds optional `acr` and `amr` columns to the `deviceCode` table when `oauthDeviceAuthorization()` is enabled. Apply them before deploying: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
