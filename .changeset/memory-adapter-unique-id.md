---
"@better-auth/memory-adapter": patch
"better-auth": patch
---

Enforce primary-key `id` uniqueness on `create` in `memoryAdapter` to prevent duplicate rows and ensure `internalAdapter.reserveVerificationValue` detects replays correctly.
