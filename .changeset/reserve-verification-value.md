---
"@better-auth/core": minor
"better-auth": minor
---

Add `internalAdapter.reserveVerificationValue`, a first-writer-wins create keyed by a deterministic primary key. It atomically records a single-use marker (such as a replay tombstone) so that exactly one concurrent caller succeeds and every other observes that the marker is already taken. Reservation requires database-backed verification storage; secondary-storage-only verification fails closed because it has no primary key boundary for the marker.
