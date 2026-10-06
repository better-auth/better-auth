---
"@better-auth/oauth-provider": minor
"better-auth": patch
---

Approving an OAuth device code now resolves `postLogin.consentReferenceId` with the approving user's session, so device access tokens, refresh tokens, and `customAccessTokenClaims` receive the selected `referenceId`, as authorization code tokens do. If `consentReferenceId` throws, `/device/approve` fails and the code stays pending.

`oauthDeviceAuthorization()` adds an optional `referenceId` column to the `deviceCode` table. Generate and apply the migration with `npx auth@latest migrate` (or `generate`) before deploying.
