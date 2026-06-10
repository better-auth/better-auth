---
"@better-auth/oauth-provider": patch
---

Enforce per-client grant types at the token endpoint. Previously only the provider-wide `grantTypes` allowlist was checked, so a client registered for `authorization_code` could still request `client_credentials` tokens, turning a user-delegated client into a machine-to-machine client. The `client_credentials` and `authorization_code` grants are now rejected with `unauthorized_client` unless the client declares them. Refresh tokens remain available to any client permitted the `authorization_code` grant (gated by `offline_access`), but are no longer issued to pure `client_credentials` clients. Clients with no recorded `grantTypes` fall back to `["authorization_code"]`, matching the registration default.
