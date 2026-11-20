---
"@better-auth/cimd": patch
---

With `metadataStaleIfError` enabled, a known client can use its stored registration again when another request successfully saves the same metadata document to the same store after a rejected save. A later invalid document or terminal HTTP response still stops stale serving.
