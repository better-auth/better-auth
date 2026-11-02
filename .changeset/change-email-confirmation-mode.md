---
"better-auth": patch
"@better-auth/core": patch
---

Add an opt-in `user.changeEmail.confirmationMode: "explicit"` so the emailed change-email link no longer changes the address just by being opened. Mail clients and link scanners that prefetch URLs can no longer trigger the change; the app previews it with `GET /change-email/preview` and applies it with `POST /change-email/confirm`, both requiring the signed-in user. The default `"instant"` keeps the current behavior. A confirmation that loses a race, or is rejected by an `update.before` hook, now returns `FAILED_TO_UPDATE_USER` instead of passing a missing user to `afterEmailVerification`.
