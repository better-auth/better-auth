---
"@better-auth/passkey": minor
---

The passkey plugin now applies `authenticatorSelection.userVerification` to both ceremonies. The configured policy is requested during authentication as well as registration, and when it is `required`, responses without the user verification flag are rejected.
