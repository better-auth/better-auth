---
"@better-auth/cimd": patch
---

Reject the fetch promise with a descriptive error when the metadata endpoint returns an out-of-range HTTP status (e.g. 999) in the Node CIMD transport, instead of throwing a RangeError inside the response callback and leaving the promise pending forever.
