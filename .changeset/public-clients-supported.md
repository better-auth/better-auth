---
"@better-auth/oauth-provider": patch
---

Add the `publicClientsSupported` option so a provider with protected dynamic client registration can advertise that its token endpoint accepts public clients. Before, a provider with `allowUnauthenticatedClientRegistration: false` and no client discovery listed only `client_secret_basic`, `client_secret_post`, and `private_key_jwt` in `token_endpoint_auth_methods_supported`, so clients that follow RFC 8414 concluded that public clients were unsupported even though the token endpoint accepts them. Set `publicClientsSupported: true` to add `none` to the list, or `false` to leave it out. Unset, the advertisement is unchanged, and the option does not open `/oauth2/register`.
