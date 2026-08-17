---
"@better-auth/core": patch
---

Fix the `client_credentials` grant encoding the HTTP Basic auth header with Base64URL instead of standard Base64 when `authentication: "basic"`. A client secret whose Base64 contains `+`, `/`, or `=` padding was mangled and rejected by a standards-compliant token endpoint (RFC 7617). It now uses standard Base64, matching the authorization-code and refresh-token requests.
