---
"@better-auth/oauth-provider": minor
---

A form-encoded POST to `/oauth2/authorize` now follows the same repeated-parameter rules as a GET request. A standard parameter sent more than once, such as `state=a&state=b`, returns `invalid_request` with "state must not appear more than once". Before, the provider used the last value and could issue a code. A repeated `resource` now keeps every value instead of only the last one. A repeated custom parameter, such as `organization`, reaches `postLogin.consentReferenceId` and the signed `oauth_query` with every value. Clients that send each standard parameter once are unaffected.
