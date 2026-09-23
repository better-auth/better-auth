---
"better-auth": patch
---

Validate and hash the new password before consuming password-reset tokens/OTPs so haveIBeenPwned rejections no longer burn the reset link.

Include existing credential accounts when resetting passwords with email OTPs so resets update the password instead of creating a duplicate account.
