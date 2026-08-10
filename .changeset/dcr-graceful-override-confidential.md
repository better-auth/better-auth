---
"@better-auth/oauth-provider": minor
---

Dynamic client registration now preserves confidential client authentication methods for unauthenticated registrations instead of converting them to public clients. Requests that omit `token_endpoint_auth_method` receive the RFC 7591 default `client_secret_basic` method and a one-time `client_secret`; requests that explicitly use `token_endpoint_auth_method: "none"` still create public clients.

Registered client `jwks` metadata can now be used with secret-based clients and is returned as a JWKS document (`{ "keys": [...] }`). Inline JWKS metadata must contain public asymmetric keys.
