---
"@better-auth/oauth-provider": patch
---

Throws correct [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1) errors at schema level:

- `unsupported_grant_type` for `grant_type`
- `unsupported_response_type` for `response_type`
