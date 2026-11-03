---
"@better-auth/passkey": patch
---

`authenticatorSelection.userVerification` now applies to authentication as well as registration: it is requested in authentication options, and with `required` passkey registration and sign-in reject responses without user verification.
