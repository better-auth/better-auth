---
"@better-auth/oauth-provider": patch
---

The token endpoint now returns `invalid_client` instead of `invalid_grant` when a request names a `client_id` that is not registered, for the `authorization_code`, `refresh_token`, and device code grants. MCP clients whose registration was deleted, for example by a database reset or an upgrade that dropped OAuth tables, now register again and prompt the user to sign in. Before, they kept the deleted `client_id` and stayed signed out until the user cleared their saved credentials by hand. A registered client that sends wrong credentials also gets `invalid_client` now, even when its code or refresh token is also invalid.
