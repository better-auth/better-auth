---
"@better-auth/cimd": patch
---

Honor the caller's AbortSignal while awaiting DNS resolution in the Node CIMD transport: a stalled resolver no longer defeats the request deadline. `dns.lookup` cannot be cancelled, so an aborted call leaves one bounded lookup outstanding per request which settles in the background and is discarded; abort listeners are cleaned up once resolution wins the race.
