---
"@better-auth/cimd": patch
---

Concurrent requests for the same Client ID Metadata Document now each save the client in their own database context. Before, a request that joined an in-flight fetch received the client saved by the first request, so on runtimes that build a context per request it could resolve a client its own database never stored, and one request's database error failed the others. A failed save now also drops the fetched document from the cache and paces the next fetch for that client like a failed fetch.
