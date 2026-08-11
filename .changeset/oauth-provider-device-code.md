---
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Registered OAuth clients can now use the RFC 8628 device flow to obtain provider-managed OAuth tokens by adding `oauthDeviceAuthorization()` alongside `oauthProvider()` or `mcp()`. Clients request a code at `/device/code` and exchange it at `/oauth2/token` after the user approves it. OAuth and OpenID discovery now advertise `device_authorization_endpoint`.

Device authorization requests can bind RFC 8707 resource indicators. `GET /device` now returns the requesting `client_id`, `scope`, and `resource` values to the authenticated user who owns the request. The `onDeviceAuthRequest` callback remains unchanged. It continues to receive `clientId` and `scope`. Token requests can reuse or narrow the approved resource set, but requests that add a resource are rejected. Existing first-party device clients continue to receive Better Auth session tokens from `/device/token`.

When enabled, `oauthDeviceAuthorization()` adds nullable `oauthClientId` and `resources` fields to `deviceCode`. Regenerate and apply the schema after adding the integration.

At `/device/code`, confidential clients authenticate with their registered method. Clients using `client_secret_basic` may omit `client_id` from the body, while public clients using `token_endpoint_auth_method: "none"` must send it. The composed client and OpenAPI contracts expose OAuth authentication and `resource` fields; standalone Device Authorization contracts omit them. Empty authentication parameters are treated as omitted, repeated non-empty authentication parameters and multiple authentication methods return `invalid_request`, and repeated `resource` parameters remain supported. Unknown OAuth client IDs use the standalone flow only when `oauthDeviceAuthorization({ validateClient })` explicitly accepts them. Malformed `resource` input returns `invalid_target` only when `resource` is the failing extension field; malformed base fields remain `invalid_request`.
