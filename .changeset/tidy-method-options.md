---
"better-auth": patch
---

Honor the HTTP method passed as the second argument to client actions, matching nested fetch options.

GET and HEAD requests omit request bodies regardless of method case, without changing the method supplied to fetch plugins.
