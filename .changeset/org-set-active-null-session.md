---
"better-auth": patch
---

Return a 401 from `/organization/set-active` and `/organization/set-active-team` when the session row could not be updated (for example when a `session.update.before` hook returns `false`), instead of failing with a 500 `TypeError`.
