---
"@better-auth/passkey": patch
---

Add a `requireUserVerification` option that requests `userVerification: "required"` for registration and authentication and rejects responses without the user-verified (UV) flag on the server.
