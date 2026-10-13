---
"better-auth": patch
---

If you set the phone number plugin's `verifyOTP` option, `/phone-number/reset-password` now checks the code with it, as `/phone-number/verify` already does. Before, password reset always compared the code against the one Better Auth generated, so apps that verify codes through a provider such as Twilio Verify could not reset passwords. If your `sendPasswordResetOTP` sends the code Better Auth generates, make sure `verifyOTP` accepts that code. Apps that don't set `verifyOTP` are unaffected.
