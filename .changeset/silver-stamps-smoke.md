---
"@better-auth/oauth-provider": patch
---

Throws correct [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1) and [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.2) errors at schema level:

- `unsupported_grant_type` for `grant_type` at `/token`
- `unsupported_response_type` for `response_type` at `/authorize`
- `invalid_redirect_uri` for `redirect_uri` and `post_logout_redirect_uris` at `/register`
- `unsupported_token_type` for `token_type_hint` at `/revoke`
