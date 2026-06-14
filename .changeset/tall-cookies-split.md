---
"better-auth": patch
---

Chunk session cache cookies using the shared cookie size threshold so values near the browser limit are split before cookie attributes push them over the limit.
