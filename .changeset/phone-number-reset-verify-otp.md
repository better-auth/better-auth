---
"better-auth": patch
---

Honor the phone number plugin's custom `verifyOTP` option when resetting a password. The reset route always used the internal OTP check, so integrations that delegate verification to an external provider such as Twilio Verify could never complete a phone number password reset.
