---
"better-auth": patch
---

Fix session cookie leak on 2FA-required sign-in. The credential handler wrote valid `session_token` / `session_data` cookies that the 2FA after-hook only appended expiring overrides to; raw-response readers could capture the valid values and replay them to bypass 2FA when `session.cookieCache.enabled`. `expireCookie` now scrubs prior matching `Set-Cookie` entries (including chunks) before re-setting. `/two-factor/disable` switched to `sensitiveSessionMiddleware` as defense in depth.
