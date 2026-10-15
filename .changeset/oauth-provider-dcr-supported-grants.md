---
"@better-auth/oauth-provider": patch
---

If you enable dynamic client registration, Claude's MCP connector can now register. It requests `urn:ietf:params:oauth:grant-type:jwt-bearer` along with `authorization_code` and `refresh_token`, and Better Auth rejected the whole registration with `invalid_client_metadata` because one grant was unsupported. Dynamic registration now keeps the requested grants the server supports and lists them in the registration response. A request that shares no grant with the server is still rejected. Clients created with `createOAuthClient` or `adminCreateOAuthClient` still reject unsupported grants.
