---
"@better-auth/cimd": patch
---

A Client ID Metadata Document fetch that never settles no longer keeps other clients at the metadata fetch concurrency limit. Once it has run for 10 seconds, a new fetch that needs its slot takes it over. Before, the slot stayed taken until the server restarted, so stalled fetches could make other clients fail with `temporarily_unavailable`.
