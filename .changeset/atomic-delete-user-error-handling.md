---
"better-auth": patch
---

fix(db): ensure atomic deleteUser and propagate pre-read errors in deleteWithHooks

- Propagate pre-read database errors in `deleteWithHooks` and `deleteManyWithHooks` instead of silently swallowing them.
- Wrap `internalAdapter.deleteUser` in `runWithTransaction` for atomic cascading deletions with rollback on failure or hook veto.
- Guarantee secondary storage session cache eviction post-commit even if child after-hooks throw.
