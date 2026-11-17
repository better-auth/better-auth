---
"@better-auth/cimd": minor
---

`createCimdMetadataResolver` lets a runtime that builds its auth instance for each request share one metadata cache, one set of fetch limits, and in-flight fetches between those instances. Create the resolver once with the transport and the fetch and validation options, then pass it to `cimd({ metadataResolver })`: each request still saves the client with its own context, and a request waits at most 10 seconds for each fetch that another request started. Setting `fetchClientMetadataResource` or another resolver option next to `metadataResolver` is a type error and throws when the plugin is created.
