---
"@better-auth/core": patch
"better-auth": patch
---

Add `internalAdapter.reserveVerificationValue`, a first-writer-wins create keyed by a deterministic primary key. It atomically records a single-use marker (such as a replay tombstone) so that exactly one concurrent caller succeeds and every other observes that the marker is already taken. The database path is atomic through the primary key; secondary-storage-only verification is best-effort.
