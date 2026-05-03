---
"better-auth": patch
---

Clear organization active hook state after sign-out so `useActiveMemberRole` does not retain a previous user's role in SPA sign-out/sign-in flows.
