---
"@better-auth/core": patch
"better-auth": patch
---

Add `internalAdapter.reserveVerificationValue`. It atomically records a single-use marker (such as a replay tombstone) so that exactly one of several concurrent callers succeeds and the rest observe that the marker is already taken. Database-backed verification storage is atomic; secondary-storage-only verification is best-effort.
