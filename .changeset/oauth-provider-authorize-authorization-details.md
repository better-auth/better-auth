---
"@better-auth/oauth-provider": minor
---

`/oauth2/authorize` and `/oauth2/par` now reject a request that carries `authorization_details` with `invalid_authorization_details` when discovery advertises `authorization_details_types_supported`, instead of ignoring the details.

Only extension grants, such as CIBA, issue authorization details. A server that advertises no types still ignores the parameter.
