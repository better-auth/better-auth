---
"@better-auth/core": patch
"better-auth": patch
---

Secondary-storage session eviction no longer fails open. `deleteUserSessions` and `deleteUser` now reject when a session could not be removed from secondary storage instead of logging the failure and reporting a successful revocation (#11326). The failure is logged as well as returned, so a caller that swallows the rejection still leaves a trace.

What the rejection does and does not do:

- The eviction runs after the surrounding database work commits, so it cannot undo the committed work. `POST /change-password` and `POST /reset-password` keep the new password, `DELETE /delete-user` and `GET /delete-user/callback` keep the deleted account, `POST /admin/remove-user` keeps the removed user, and `POST /admin/ban-user` keeps the ban. Each returns an error and the sessions the eviction could not clear stay usable until they expire — ban enforcement runs when a session is created rather than on every request, so a banned user's existing session keeps working for its remaining lifetime.
- `onPasswordReset` does not run in these cases. It fires only after the reset transaction succeeds, and an eviction failure is a reset failure.
- When the surrounding work committed, the rejection reaches the caller on every adapter. The after-commit hooks run whether or not the adapter runs transactions, so the eviction's failure is raised out of them either way.
- When the surrounding work failed, the queued eviction runs at all only on an adapter that reports `transaction: false`. The Drizzle, Prisma and Kysely adapters default to that; the MongoDB adapter defaults to transactions whenever it is given a client. On that path the failure is logged rather than raised, so the request fails for the reason it originally did and the eviction's error is only in the log — and it is logged twice, once by the eviction and once by the after-commit drain. On every other adapter the eviction is discarded along with the work it belonged to.
- The eviction always moves itself behind the other after-commit hooks, including on that failure path, where the reordering buys nothing: that drain already continues past a failing hook.
- Moving it there orders the eviction last; it does not make it run. A hook queued ahead of it that throws still ends the drain before the eviction's turn comes round, so a `databaseHooks.*.delete.after` of your own that throws leaves the eviction skipped and without a log line. That is pre-existing after-commit hook behavior, tracked as #11735.
- Every listed session is attempted even after one of them fails, so a partial storage outage clears as much as it can before the failure is reported. The eviction is sequential and the list is uncapped, so a full outage costs one failing call per listed session instead of stopping at the first.
- A session the eviction could not remove stays listed in the user's `active-sessions` index, so the next revocation of that user tries it again. `deleteUser` is the exception: it is guarded on the user row having been deleted, so retrying it cannot re-arm the eviction and the cached session stays until it expires.
- Account access revoked for an unproven email fails the same way, between two irreversible steps: the user's accounts are already deleted and the follow-up `emailVerified` update no longer runs. Restart the verification flow to finish.

No new options, types or schema fields.
