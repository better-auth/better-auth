---
"@better-auth/oauth-provider": patch
---

Discovery metadata now lists `none` in `revocation_endpoint_auth_methods_supported` whenever it lists `none` for the token endpoint. `/oauth2/revoke` already accepted a public client that sends only its `client_id`, but the metadata told clients it could not, so clients that follow RFC 8414 concluded they could not revoke their own tokens.
