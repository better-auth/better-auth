---
"better-auth": patch
---

Return the pending session as the React server snapshot during hydration so `useSession` no longer causes hydration mismatches when the session resolves before a subtree hydrates.
