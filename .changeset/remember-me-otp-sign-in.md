---
"better-auth": patch
---

Add optional `rememberMe` to email OTP sign-in (`signIn.emailOtp`) and phone OTP verify (`phoneNumber.verify`), matching email/password and phone password behavior. Also clear a stale `dont_remember` cookie when establishing a remembered session so later refreshes stay persistent.
