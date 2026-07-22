---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Registered OAuth clients can now use the RFC 8628 device flow to obtain provider-managed OAuth tokens. Add `deviceCodeGrant()` alongside `deviceAuthorization()` and `oauthProvider()`; clients request a code at `/device/code` and exchange it at `/oauth2/token` after the user approves it. OAuth and OpenID discovery now advertise `device_authorization_endpoint`.

Device authorization requests can bind RFC 8707 resource indicators. `GET /device` now returns the requesting `client_id`, `scope`, and `resource` values for approval pages, and `onDeviceAuthRequest` receives the resource as its third argument. Token requests can reuse or narrow the approved resource set, but requests that add a resource are rejected. Existing first-party device clients continue to receive Better Auth session tokens from `/device/token`.

The `deviceCode` table adds an optional `resource` field. Run `npx @better-auth/cli generate` and apply the migration before deploying this update.
