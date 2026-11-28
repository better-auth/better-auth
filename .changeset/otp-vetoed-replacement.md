---
"better-auth": patch
---

Email OTP and phone number OTP no longer send a code when a `verification.update.before` database hook blocks it from replacing an earlier code. Before, a send that overlapped an earlier one could deliver a code that was never stored, so it always failed with `INVALID_OTP`. The send now fails with `FAILED_TO_CREATE_VERIFICATION`, or returns the usual reply on endpoints that hide whether an account exists.
