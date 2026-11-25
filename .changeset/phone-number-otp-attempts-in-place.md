---
"better-auth": patch
---

A used phone number OTP can no longer become valid again after a wrong code checked against it finishes. Every code now counts toward `allowedAttempts`, including codes sent at the same time, and once they are used up, every attempt returns `TOO_MANY_ATTEMPTS` until a new code is sent.
