---
"better-auth": patch
---

A used email OTP can no longer become valid again after a wrong guess against it finishes, and the code left by two overlapping sends keeps working after a typo. Every guess now counts toward `allowedAttempts`, including guesses sent at the same time.
