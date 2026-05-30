---
"better-auth": patch
---

Support server-side `accountInfo` calls without session headers.

`auth.api.accountInfo` now accepts an optional `userId`, so a trusted server-side caller can read a user's provider profile without constructing session headers. This mirrors `getAccessToken` and `refreshToken`. HTTP callers still require a valid session, and a session always takes precedence over a supplied `userId`.

The shared "resolve the target user, then fetch a valid access token" logic behind these three endpoints now lives in one place. As part of that, a server-side call that supplies neither a session nor a `userId` reports `USER_ID_OR_SESSION_REQUIRED` (400) consistently, rather than `UNAUTHORIZED` on some endpoints.
