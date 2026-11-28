---
"better-auth": patch
---

The `onSuccess` callback passed to an auth call now runs after the client and plugin `onSuccess` hooks, so a throwing callback no longer stops them from storing the new session.
