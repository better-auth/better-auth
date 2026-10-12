---
"@better-auth/oauth-provider": patch
---

Fix the OAuth revocation endpoint to answer 200 for invalid tokens per RFC 7009 section 2.2. The `/oauth2/revoke` endpoint returned 400 `invalid_request` when the submitted token was unknown, already revoked, or looked up with a mismatched `token_type_hint`. The RFC requires a 200 response in all those cases — the client cannot handle such errors, and the revocation goal is already achieved. `unsupported_token_type` (self-contained JWT access tokens) and `invalid_client` still surface as errors. A wrong `token_type_hint` no longer gates the search either: the hinted lookup failing now extends across the other supported token type, so the token is actually revoked instead of the request failing with 400.
