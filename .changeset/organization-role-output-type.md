---
"better-auth": patch
---

Fix `member.role` and `invitation.role` return types to accept the comma-joined multi-role and custom-role values the runtime actually returns, instead of narrowing to the default-role union.
