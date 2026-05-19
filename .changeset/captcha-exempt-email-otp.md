---
"better-auth": minor
---

Email OTP sign-in no longer fails with a missing-captcha-token error under the default captcha settings, and requests with duplicate slashes (e.g. `/sign-in//email`) can no longer bypass captcha verification. The `endpoints` option now accepts wildcards like `/sign-in/*` and `/sign-in/**` alongside exact paths. If you previously relied on a partial path (e.g. `/sign-in`) covering every sign-in variant, replace it with a wildcard or list each variant.
