---
"better-auth": patch
---

Admin permission changes and bans now take effect immediately for admin APIs, even when session cookie cache is enabled. Sensitive session checks also continue to work in stateless apps where signed cookies are the session record.
