---
"@better-auth/core": patch
---

Make `consumeOne` and `incrementOne` optional again for custom database adapters. Adapters without native implementations use conditional deletes and compare-and-swap updates, including guards for null counters and mapped IDs. Invalid affected-row counts, unsupported snapshots, and exhausted increment retries raise errors rather than report success.

Fallbacks require atomic conditional writes and accurate affected-row counts. Built-in adapters continue using native operations. Custom secondary storage and rate-limit storage requirements are unchanged.
