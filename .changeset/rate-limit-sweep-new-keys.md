---
"better-auth": patch
---

Database rate limiting now removes expired rows even when requests keep arriving from new IPs. Previously the sweep only ran when a key whose window had elapsed was seen again, so rows for clients that never returned stayed in the table. The sweep also runs when a new key is created, at most once per longest rate-limit window. This sweep is skipped when a function-valued `customRules` entry is configured, since its window is only known per request.
