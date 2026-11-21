---
"better-auth": patch
---

`/two-factor/get-totp-uri` (`auth.api.getTOTPURI`) now uses the `issuer` option of the `twoFactor` plugin. Before, it ignored that option and always used `appName`, so the URI it returned named a different issuer than the one from `/two-factor/enable`, and a QR code built from it showed the wrong name in authenticator apps. An `issuer` passed in the body of a single `/two-factor/enable` request is not stored, so `get-totp-uri` cannot return it and still uses the plugin option.
