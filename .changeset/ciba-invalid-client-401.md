---
"@better-auth/ciba": patch
---

`/oauth2/bc-authorize` now answers `invalid_client` with status 401 and a `WWW-Authenticate` challenge, as CIBA §13 requires, instead of 400 when the client sent no credentials or used body credentials. The error code and description are unchanged.
