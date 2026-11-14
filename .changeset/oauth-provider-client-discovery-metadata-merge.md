---
"@better-auth/oauth-provider": minor
---

A client discovery's `discoveryMetadata` now merges under the same rules as extension `metadata()`. When it and an extension both advertise a list under one key, discovery publishes the lists combined. Previously the client discovery's list replaced the extension's.

When two client discoveries set the same non-list key, the first registered now wins and a warning is logged. Previously the last one won silently. The `document` passed to `metadata()` no longer includes client-discovery metadata.
