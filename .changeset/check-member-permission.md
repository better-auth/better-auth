---
"better-auth": patch
---

Add a server-only `checkMemberPermission` endpoint that reports whether a specific organization member has the given permissions. It performs no authorization of its own and takes no session, so the caller must authorize the query before calling it.
