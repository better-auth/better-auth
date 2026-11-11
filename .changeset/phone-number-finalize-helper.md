---
"better-auth": patch
---

refactor(phone-number): unify `verifyPhoneNumber` completion paths through a single `finalize` helper

The three terminal branches of `/phone-number/verify-otp` (token reuse, new
session, no-session) each duplicated the call to `callbackOnVerification` and
the response shape. They now route through a single `finalize` helper that
encodes the session strategy as a discriminated union, so future changes to
the response or the verification callback can't drift between branches.
No behavior change.
