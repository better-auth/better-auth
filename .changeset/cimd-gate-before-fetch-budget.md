---
"@better-auth/cimd": minor
---

A flood of refused `client_id` URLs can no longer use up the metadata fetch budget and make allowed clients fail with `temporarily_unavailable`. A URL that URL validation or `isMetadataDocumentUrlAllowed` refuses is now refused before the budget applies, so it always answers `invalid_client` with status 400, where it could previously answer 429 once the budget was spent. `isMetadataDocumentUrlAllowed` now runs once for each request that needs a fetch, including requests that join a fetch already in flight, and still does not run on a fresh cache hit.
