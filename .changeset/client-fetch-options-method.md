---
"better-auth": patch
---

Client actions now send the HTTP method passed in the second-argument fetch options, the same as when it is nested under `fetchOptions`. Passing a lowercase `get` or `HEAD` method no longer fails because a request body was attached.
