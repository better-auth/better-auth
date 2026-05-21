---
"better-auth": minor
---

The captcha plugin now supports Google reCAPTCHA Enterprise as a new provider. Configure it with `provider: "google-recaptcha-enterprise"` and supply your Google Cloud `projectId`, `siteKey`, and an API key via `secretKey`. Clients may optionally send an `x-captcha-action` header, which the server forwards as `expectedAction` to the Assessments API to block token replay across actions.
