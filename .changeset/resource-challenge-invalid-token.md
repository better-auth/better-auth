---
"@better-auth/oauth-provider": patch
"@better-auth/core": patch
---

Resource-server challenges no longer turn a rejected request into a 500, and they now tell clients when the token they sent is invalid.

`createResourceServerChallenge` used to throw when an `error_description` contained a character that RFC 6750 does not allow in that parameter. Better Auth's own DPoP message `DPoP proof typ must be "dpop+jwt"` was one of them. The description is now fitted into the allowed characters: `"` becomes `'`, other disallowed characters become spaces, and an empty result is left out. Invalid scope tokens in `challengeScopes` still throw.

When the request presented a token that failed verification, the 401 Bearer challenge now carries `error="invalid_token"` and an `error_description`, following RFC 6750 §3 and §3.1. A request without a token still gets no error code. `verifyBearerToken` and `verifyAccessTokenRequest` now set `error: "invalid_token"` and `error_description` on their expired, invalid, inactive, and unreadable token errors, and the challenge's response body includes both fields alongside `message`.
