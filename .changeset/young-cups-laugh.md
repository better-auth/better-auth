---
"better-auth": patch
---

`sendVerificationEmail` was invoked via `runInBackgroundOrAwait`, which could defer work when `advanced.backgroundTasks.handler` is configured (so the handler could return **200** before the email callback finished) and, in the default path, **caught and logged errors without rethrowing**. User callbacks that throw `APIError` (e.g. **429** from a rate limiter) were therefore not reliably reflected in the HTTP response ([better-auth/better-auth#8757](https://github.com/better-auth/better-auth/issues/8757)).

Now we await `sendVerificationEmailFn` so failures surface to the client with the correct status. The unauthenticated `/send-verification-email` path enforces a constant-time floor (500 ms) so that the response duration does not reveal whether the email belongs to a real unverified user.
