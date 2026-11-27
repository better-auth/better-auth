---
"better-auth": minor
"@better-auth/core": minor
---

Add `session.absoluteExpiresIn` to end sessions a fixed number of seconds after sign-in, even if they are still in use. `expiresIn` and `updateAge` still control when an inactive session expires, but refreshes no longer extend a session or its cookie past the absolute limit. Sessions that exist when you enable the option are no longer refreshed and expire at their stored expiration date. The option is off by default.
