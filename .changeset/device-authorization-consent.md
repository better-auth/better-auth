---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

OAuth device authorization now uses the OAuth Provider's sign-in, post-login, and consent pages. A verification page sends the user code to `/oauth2/device/verify` (`authClient.oauth2.device.verify`), and the consent page receives a `user_code` parameter to show beside the requested client, scopes, and resources. Device requests always ask for consent, even for clients with `skip_consent` or an existing consent.

Approving a device code records an `oauthConsent` and resolves `postLogin.consentReferenceId`, so device tokens, refresh tokens, and `customAccessTokenClaims` receive the selected `referenceId`. ID tokens include the approving user's `auth_time`. Approval through `/device/approve` also records the consent and fails when `consentReferenceId` rejects it.

`oauthDeviceAuthorization()` adds the optional `referenceId` and `authTime` columns to the `deviceCode` table. Generate and apply the migration with `npx auth@latest migrate` (or `generate`) before deploying.
