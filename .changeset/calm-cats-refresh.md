---
"@better-auth/oauth-provider": patch
---

Omit inactive issuance-session IDs from tokens created by OAuth refresh grants, and reject cached session-bound rotation replays after that session becomes inactive.
