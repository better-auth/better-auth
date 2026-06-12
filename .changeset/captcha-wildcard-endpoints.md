---
"better-auth": minor
---

The captcha plugin now requires endpoint entries to match full auth paths unless they use wildcard patterns. This prevents requests like `/sign-in//email` from bypassing captcha while preserving trailing-slash matches like `/sign-in/email/`. To protect multiple routes, replace partial paths like `/sign-in` with explicit wildcards such as `/sign-in/*` or `/sign-in/**`.
