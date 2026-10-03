---
"better-auth": patch
---

Validate and hash the new password before consuming password-reset tokens/OTPs so haveIBeenPwned rejections no longer burn the reset link.

Include the local credential account when resetting with email OTPs, and keep OTP account lookups out of OTP-send requests.
