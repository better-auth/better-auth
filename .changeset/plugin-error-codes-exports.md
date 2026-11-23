---
"better-auth": patch
"@better-auth/api-key": patch
"@better-auth/electron": patch
"@better-auth/passkey": patch
"@better-auth/sso": patch
---

Every plugin now exports its error codes the same way, as `<PLUGIN>_ERROR_CODES` from the plugin entry point and its client entry point. This adds `CAPTCHA_ERROR_CODES`, `HAVE_I_BEEN_PWNED_ERROR_CODES` and `SSO_ERROR_CODES`, and the SSO, electron and device-authorization client plugins now expose `$ERROR_CODES`. The legacy `ERROR_CODES` export of the multi-session plugin is deprecated in favor of `MULTI_SESSION_ERROR_CODES`.
