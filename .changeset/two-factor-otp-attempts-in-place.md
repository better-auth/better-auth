---
"better-auth": patch
---

A used two-factor OTP can no longer become valid again after a wrong code checked against it finishes. Every code now counts toward `allowedAttempts`, including codes sent at the same time.
