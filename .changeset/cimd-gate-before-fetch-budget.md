---
"@better-auth/cimd": patch
---

Client ID metadata document URLs refused by URL validation or `isMetadataDocumentUrlAllowed` no longer use up the metadata fetch budget, so a flood of disallowed `client_id` URLs can no longer cause allowed clients to be rejected with `temporarily_unavailable`.
