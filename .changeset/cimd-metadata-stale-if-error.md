---
"@better-auth/cimd": patch
---

A new opt-in `metadataStaleIfError` option keeps a known Client ID Metadata Document client working while its metadata host is briefly down. When refreshing a stored client's document times out, fails to connect, or gets an HTTP 500, 502, 503, or 504 response, the stored client is served with a warning for up to the configured time (at most 24 hours) after it was last validated, and the document is fetched again at most once a minute. A fetch limit or the Node transport's DNS lookup limit serves the stored client only within 5 minutes of such a failure. Other failures, such as an HTTP 4xx response, an invalid document, or a URL that the fetch policy refuses, still fail as before, and also stop that instance from serving the stored client until a refresh succeeds. For `private_key_jwt` clients, cached `jwks_uri` keys are used the same way when fetching them fails transiently. Without the option, nothing changes.
