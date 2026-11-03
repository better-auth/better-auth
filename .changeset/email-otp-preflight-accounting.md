---
"better-auth": patch
---

Fixed the email OTP `checkVerificationOtp` and `resetPassword` endpoints and the phone number `resetPassword` endpoint allowing more OTP guesses than `allowedAttempts` when requests arrive concurrently. A correct check still leaves the OTP usable for the follow-up call.
