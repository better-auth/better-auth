---
"better-auth": patch
---

Stop the email OTP plugin from mailing an email-verification code to an already verified address on behalf of a caller who is not signed in as that user. This applies to `/email-otp/send-verification-otp` and to the code sent by `sendVerificationOnSignUp` when sign-up is attempted with the email of an existing, already verified account. Such requests now get the same success response as for an unknown address, with no email sent and no code stored.
