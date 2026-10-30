---
"@better-auth/cimd": patch
---

The Node metadata transport now rejects responses with an out-of-range status or an invalid reason phrase, so the client is reported as `invalid_client` instead of the error escaping the request and crashing the process.
