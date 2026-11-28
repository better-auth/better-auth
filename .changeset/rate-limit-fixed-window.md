---
"better-auth": patch
---

Stop allowed requests from extending the rate-limit window on memory and database storage. Steady traffic below `max` per `window`, such as polling `/get-session` or the device flow polling `/oauth2/token`, no longer gets a 429.
