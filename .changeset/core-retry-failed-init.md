---
"better-auth": patch
---

Retry auth context initialization after a transient failure instead of caching the rejection forever. Previously, if `initFn` (e.g. a plugin's `init`) rejected once — a momentary DB connectivity blip — every later request and `auth.api.*`/`auth.$context` call would fail for the lifetime of the process, since the failed promise was awaited directly. Initialization is now retried on the next call after a failure, while a successful context is still memoized and never re-created.
