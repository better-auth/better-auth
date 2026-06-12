---
"better-auth": minor
---

Phone number OTP verification now consumes the code atomically and tracks failed attempts without a race, so concurrent submissions can no longer replay a single-use code or slip past the attempt limit.
