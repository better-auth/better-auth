---
"@better-auth/test-utils": patch
---

Adapter test suites now run significantly faster. Cleanup between tests no longer re-deletes rows it has already removed, so suites spend far less time waiting on redundant database round trips.
