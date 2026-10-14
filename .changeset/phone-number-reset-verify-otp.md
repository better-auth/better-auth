---
"better-auth": patch
---

If you set the phone number plugin's `verifyOTP` option, `/phone-number/reset-password` now checks the code with it, as `/phone-number/verify` already does. Before, password reset always compared the code with the one Better Auth generated, so apps that verify codes through a provider such as Twilio Verify could not reset passwords. If your `sendPasswordResetOTP` sends the code Better Auth generates, make sure `verifyOTP` accepts that code.

For every app, the reset route now checks the new password's length before the code. A password that is too short or too long returns `PASSWORD_TOO_SHORT` or `PASSWORD_TOO_LONG` even when the code is also wrong, and the request no longer counts as a wrong code attempt.
