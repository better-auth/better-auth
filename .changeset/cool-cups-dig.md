---
"better-auth": patch
---

The admin plugin's `unbanUser`, `setRole` and `adminUpdateUser` endpoints used to call `internalAdapter.updateUser` without checking that the target user existed, so when the caller passed an unknown id the underlying database error (for example Prisma's `P2025`) bubbled up as a generic HTTP 500. those endpoints now mirror the existing guard in `banUser`: look the user up via `findUserById`, and throw a clean `NOT_FOUND` (`USER_NOT_FOUND`) when no row is returned. Closes #9800.
