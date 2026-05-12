---
"better-auth": patch
---

Email OTP sign-in no longer fails with a missing-captcha-token error under the default captcha settings. If you intentionally want captcha on email OTP sign-in, add `/sign-in/email-otp` to `captcha({ endpoints })`.
