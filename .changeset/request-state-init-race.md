---
"@better-auth/core": patch
---

Fix a request-state `AsyncLocalStorage` initialization race that could intermittently throw `No request state found. Please make sure you are calling this function within a runWithRequestState callback.` `ensureAsyncStorage()` now memoizes its in-flight initialization so concurrent first-callers share a single `AsyncLocalStorage` instance instead of each constructing one and the last write winning. This surfaced on serverless cold start (e.g. Cloudflare Workers) where the first requests arrive before the lazy `node:async_hooks` import settles, causing `runWithRequestState().run()` and a nested `getCurrentRequestState()` to land on different instances.
