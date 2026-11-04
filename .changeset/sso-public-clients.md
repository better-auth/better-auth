---
"@better-auth/sso": patch
---

OIDC providers can now be registered as public clients with `tokenEndpointAuthentication: "none"`. These providers have no client secret: the code exchange authenticates with only `client_id` and the PKCE code verifier, so PKCE is required. Registering or updating a `none` provider with a `clientSecret` or with `pkce: false` is rejected, and discovery never selects `none` on its own.
