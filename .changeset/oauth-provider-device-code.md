---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Registered OAuth clients can now use the RFC 8628 device flow to obtain OAuth access tokens. Add `oauthDeviceAuthorization()` alongside `oauthProvider()` or `mcp()`, request a code at `/device/code`, and exchange it at `/oauth2/token` after the user approves it. OAuth and OpenID discovery advertise the `device_authorization_endpoint`.

Device authorization requests can bind RFC 8707 resource indicators. `GET /device` returns the requested client, scopes, and resources to the authenticated user who owns the request. Token requests can reuse or narrow the approved resources, but cannot add new ones. Existing first-party device clients continue to receive Better Auth session tokens from `/device/token`.

Enabling `oauthDeviceAuthorization()` adds nullable `oauthClientId` and `resources` fields to `deviceCode`. Regenerate and apply the database schema after adding the integration.

Confidential clients authenticate at `/device/code` with their registered method, while public clients send `client_id`. Empty `client_id`, `scope`, `user_id`, and authentication values are treated as omitted; multiple non-empty values for any of these parameters return `invalid_request`, while multiple `resource` values remain supported. Unknown OAuth client IDs enter the standalone device flow only when `oauthDeviceAuthorization({ validateClient })` accepts them.
