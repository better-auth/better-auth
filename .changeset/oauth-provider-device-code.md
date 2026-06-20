---
"@better-auth/oauth-provider": minor
---

Add `deviceCodeGrant()` so limited-input clients (CLIs, smart TVs, IoT) can get an OAuth access token through the RFC 8628 device flow. Used alongside the device-authorization and oauth-provider plugins, the device requests a code, the user approves it, and the client polls `/oauth2/token` for a scoped, audience-bound token instead of a Better Auth session token. The provider also advertises `device_authorization_endpoint` in its discovery metadata.
