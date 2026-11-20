---
"@better-auth/ciba": patch
---

`/oauth2/bc-authorize` now answers `invalid_client` with status 401 and a `WWW-Authenticate` challenge, as CIBA §13 requires, instead of 400 when the client sent no credentials, used body credentials, or named no client. A request with no `client_id` now answers `invalid_client` instead of `invalid_request`. The description is unchanged.
