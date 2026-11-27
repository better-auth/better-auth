---
"better-auth": minor
"@better-auth/core": minor
---

Add `session.absoluteExpiresIn` to end sessions a fixed number of seconds after sign-in, however active they are. `expiresIn` and `updateAge` keep working as the inactivity timeout, and refreshes no longer extend the session or its cookie past the absolute limit. It is off by default.
