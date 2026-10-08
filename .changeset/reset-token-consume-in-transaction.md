---
"better-auth": patch
---

A failed password reset no longer spends the reset link or OTP. `/reset-password`, `/email-otp/reset-password` and `/phone-number/reset-password` now check the token or code without consuming it, validate and hash the new password, then consume it in the same transaction as the session revocation and password write. A rejected password, such as one refused by `haveIBeenPwned`, or a failed write leaves the link or OTP usable for another attempt. Wrong codes still count against the OTP attempt limit.
