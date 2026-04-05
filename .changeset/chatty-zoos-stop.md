---
"better-auth": minor
---

Added optional properties captchaResponseHeader and remoteUserIPHeader to BaseCaptchaOptions to specify custom header keys.
Fallback to default headers (x-captcha-response) if not specified.
Reverts behavior to not automatically forward the user IP to captcha providers unless explicitly configured (options.includeUserIP).
