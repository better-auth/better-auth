---
"@better-auth/mongo-adapter": patch
---

Fix `unable_to_create_user` on fresh databases with transactions enabled. The adapter no longer calls `abortTransaction` after `commitTransaction` has been attempted, so a genuine commit failure surfaces its real error instead of the driver's "Cannot call abortTransaction after calling commitTransaction" guard error.
