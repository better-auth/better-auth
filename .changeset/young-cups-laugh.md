---
"better-auth": patch
---

`sendVerificationEmail` was invoked via `runInBackgroundOrAwait`, which could defer work when `advanced.backgroundTasks.handler` is configured (so the handler could return **200** before the email callback finished) and, in the default path, **caught and logged errors without rethrowing**. User callbacks that throw `APIError` (e.g. **429** from a rate limiter) were therefore not reliably reflected in the HTTP response ([better-auth/better-auth#8757](https://github.com/better-auth/better-auth/issues/8757)).

Now we await `sendVerificationEmailFn` so failures surface to the client with the correct status. This does not weaken unauthenticated anti-enumeration behavior, since this path runs only after a real unverified user is determined
