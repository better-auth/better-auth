---
"better-auth": patch
---

`POST /device/token` now accepts `application/x-www-form-urlencoded` request bodies, as RFC 8628 requires, instead of rejecting them with `415`. OAuth clients such as `openid-client` can now poll the device authorization grant.
