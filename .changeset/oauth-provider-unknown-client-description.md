---
"@better-auth/oauth-provider": patch
---

Requests that name a `client_id` the server does not know now fail with `error_description` set to `client not found`. Before, `/oauth2/authorize` said `client_id is required`, which read as a missing parameter, and `/oauth2/token`, `/oauth2/revoke`, and `/oauth2/introspect` said `missing client`. You would see this, for example, when an MCP client kept a registration the server had deleted. The `invalid_client` error code is unchanged.
