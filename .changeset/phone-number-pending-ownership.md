---
"better-auth": minor
---

A phone number is now set only by verifying it: sign-up and sign-in routes reject a `phoneNumber` with `PHONE_NUMBER_CANNOT_BE_SET`, a number mapped from a social profile is dropped, and verifying a number stored unverified on another account requires that account's session, or the cookie from `requireVerification` sign-in, and otherwise returns `PHONE_NUMBER_PENDING_VERIFICATION`, while `updatePhoneNumber: true` moves such a number to the signed-in user. Phone sign-in with `requireVerification` now requires `sendOTP` and returns `SEND_OTP_NOT_IMPLEMENTED` without it.
