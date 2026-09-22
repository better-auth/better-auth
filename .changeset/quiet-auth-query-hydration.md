---
"better-auth": patch
---

Fix React hydration mismatches when a session or plugin auth query resolves before a streamed component hydrates. Preserve the server-rendered pending state during hydration, then update to the current client state without changing ordinary or computed plugin stores.
