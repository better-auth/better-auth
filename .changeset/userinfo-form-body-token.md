---
"@better-auth/oauth-provider": patch
---

OIDC UserInfo `POST` requests now accept bearer access tokens in an `application/x-www-form-urlencoded` request body. Requests that send bearer tokens in both the Authorization header and form body now return `invalid_request`.
