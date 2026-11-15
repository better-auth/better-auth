---
"@better-auth/ciba": minor
---

A client can now register the authorization details types it will request with `authorization_details_types` (RFC 9396 §10), and CIBA rejects a request for any other type with `invalid_authorization_details`.

Registration fails with `invalid_client_metadata` when a listed type is not in `authorizationDetailsTypes`. A client without the field may still request every configured type.
