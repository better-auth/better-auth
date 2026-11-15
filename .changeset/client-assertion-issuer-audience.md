---
"@better-auth/oauth-provider": minor
---

Client assertions, such as `private_key_jwt` assertions, must now name the provider's issuer as their only `aud` value, as RFC 10070 §4 and §5 require. This applies at the token, introspection, revocation, PAR, and plugin endpoints that authenticate a client. A client that signs for the token endpoint URL, the PAR endpoint URL, or another endpoint URL now gets `invalid_client`. So does an `aud` list that names the issuer and another value. Before, the URL of the endpoint called, the issuer, or at PAR the token endpoint URL was accepted, which left clients open to audience injection.

To keep accepting clients that still sign for an endpoint URL while you update them, set `assertionAudience: "issuer-or-endpoint"`. This transitional setting restores the previous behavior and its weaker protection. `POST /oauth2/client/rotate-keys` still accepts only its own URL.
