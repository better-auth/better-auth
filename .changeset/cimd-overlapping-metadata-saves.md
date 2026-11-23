---
"@better-auth/cimd": patch
---

With `metadataStaleIfError` enabled, a known client regains stored-registration fallback when a request on the same resolver saves the result of the same metadata fetch through the same adapter after a rejected save. Fetch-policy and local-capacity refusals allow fallback only within five minutes of a transient failure and within the configured age limit. A later invalid document or terminal HTTP response still stops fallback.
