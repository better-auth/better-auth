---
"better-auth": patch
---

Looking up a verification value now deletes expired verification rows at most once a minute per server instance, instead of on every lookup. This removes a delete query from most verification reads. Each flow still checks a value's expiry before it accepts the value.
