---
"better-auth": minor
---

Generic OAuth providers now reuse their discovery document for five minutes across auth instances, and share one JWKS resolver per key set, so runtimes that construct an auth instance per request no longer fetch provider metadata on every request. Discovery requests are now bounded by a new `discoveryTimeout` option, which defaults to 10 seconds and applies to retries as well.
