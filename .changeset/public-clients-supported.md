---
"@better-auth/oauth-provider": patch
---

Add `advertisedMetadata.token_endpoint_auth_methods_supported` so a provider can state which client authentication methods its token endpoint accepts in discovery. Before, a provider with `allowUnauthenticatedClientRegistration: false` and no client discovery listed only `client_secret_basic`, `client_secret_post`, and `private_key_jwt`, so clients that follow RFC 8414 concluded that public clients were unsupported even though the token endpoint accepts them. Set the list to include `none` to advertise public clients. Unset, the advertisement is unchanged, and the option does not open `/oauth2/register` or change what the token endpoint accepts.
