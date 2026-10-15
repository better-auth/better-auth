---
"@better-auth/oauth-provider": minor
---

If you use `oauthDeviceAuthorization()`, users now approve OAuth device codes on the provider's sign-in, account selection, post-login, and consent pages, the same as an authorization request. Your device verification page sends the browser to `/oauth2/authorize?user_code=<code>`. The consent page always opens for a device and receives `user_code` to display, and afterwards the user returns to your verification page with `status=approved` or `status=denied`, or with `error` and `error_description` when the code is unknown or expired. Device tokens and their refreshes now carry the `referenceId` from `postLogin.consentReferenceId` and the user's authentication time, and each approval records a consent.

Previously, approval pages called `/device/approve` or `/device/deny` directly, which skipped post-login selection and consent. Those endpoints and `/device` now refuse OAuth device codes with `invalid_request` and name the URL to use, so update your approval page before upgrading. Standalone `deviceAuthorization()` setups are unaffected.

`oauthDeviceAuthorization()` adds optional `referenceId` and `authTime` columns to the `deviceCode` table. Apply them before deploying: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.
