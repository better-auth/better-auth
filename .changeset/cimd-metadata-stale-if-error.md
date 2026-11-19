---
"@better-auth/cimd": patch
---

A new opt-in `metadataStaleIfError` option keeps a known client working while its metadata host is briefly down. When refreshing its document times out after its host name resolved, fails to connect, or gets HTTP 500, 502, 503, or 504, the stored client is served with a warning for up to the configured time (at most 24 hours) since it was last validated, and its cached `jwks_uri` keys keep working the same way. Other failures still reject the request.
