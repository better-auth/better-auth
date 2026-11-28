---
"better-auth": patch
"@better-auth/core": patch
---

`auth.handler` now builds its router once per base path and reuses it, instead of building every endpoint and route again on every request. This lowers the CPU cost of each request, most of all for apps with many plugins. Runtimes without a native `AsyncLocalStorage` keep building a router per request, since the polyfill cannot keep overlapping requests apart.
