---
"better-auth": patch
---

URL-encode `callbackURL` in the verify-email links sent during OAuth account linking and username sign-in.

Both paths interpolated the caller's `callbackURL` into the verification link without encoding it. A legitimate value containing an ampersand, such as `/welcome?ref=oauth&plan=pro`, was truncated at the first `&`, so the user landed on the wrong page after verifying their email. The value is now encoded the same way the other verify-email links already handle it.
