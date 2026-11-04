---
"better-auth": patch
---

Stop logging "Endpoint path conflicts detected" when a later plugin replaces an earlier plugin's endpoint under the same key. Only the later endpoint is routed, so there is no conflict to report.
