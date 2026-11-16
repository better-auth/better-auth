---
"better-auth": patch
---

A verification lookup that finds an expired value now deletes it, so later lookups no longer return it. Since 1.7.24, an expired value could be returned to repeated lookups for up to a minute.
