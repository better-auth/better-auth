---
"better-auth": patch
---

A used phone number OTP can no longer become valid again after a wrong code checked against it finishes. Every wrong guess now counts toward `allowedAttempts`, including guesses made at the same time, and once they are used up, every attempt returns `TOO_MANY_ATTEMPTS` until the code expires or a new code is sent.
