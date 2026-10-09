---
"@better-auth/oauth-provider": minor
---

If you use `oauthDeviceAuthorization()` with `postLogin.consentReferenceId`, device access tokens and refresh tokens now carry the `referenceId` it returns when the user approves the device, as authorization code tokens do, and `customAccessTokenClaims` receives it. Previously, device tokens had no `referenceId`, so an API could not tell which organization a device was approved for. If `consentReferenceId` throws, `/device/approve` fails and the code stays pending. Device approval does not call `postLogin.shouldRedirect`, so `consentReferenceId` must reject a missing selection itself.

`oauthDeviceAuthorization()` adds an optional `referenceId` column to the `deviceCode` table. Apply it before deploying: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM. Standalone `deviceAuthorization()` setups are unaffected.
