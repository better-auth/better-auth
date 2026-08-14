---
"@better-auth/oauth-provider": minor
---

OAuth Provider endpoints now return standard OAuth `{ error, error_description }` responses for malformed requests. Token requests distinguish missing input (`invalid_request`), failed client authentication (`invalid_client`), and invalid or mismatched grants (`invalid_grant`). Failed HTTP Basic authentication also returns `401` with a `WWW-Authenticate` challenge.

Authorization errors redirect to a registered client's trusted redirect URI with `state` and `iss`. The response uses the URL fragment for implicit `token` and `id_token` responses unless the client explicitly requests query mode. Requests without a trusted redirect URI continue to use the server error page.

Token, introspection, and revocation requests now treat empty credential values as omitted, reject repeated non-empty client credentials, and require confidential clients to use their registered `token_endpoint_auth_method`. Introspection and revocation requests also ignore unrecognized `token_type_hint` values instead of rejecting the request.
