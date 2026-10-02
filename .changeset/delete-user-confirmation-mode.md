---
"better-auth": patch
"@better-auth/core": patch
---

Add an opt-in `user.deleteUser.confirmationMode: "explicit"` so the emailed delete-account link no longer deletes the account just by being opened. Mail clients and link scanners that prefetch URLs can no longer trigger a deletion; the app previews the request with `GET /delete-user/preview` and applies it with `POST /delete-user/confirm`. The default `"instant"` keeps the current behavior.
