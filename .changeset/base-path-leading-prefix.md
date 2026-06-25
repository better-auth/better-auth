---
"better-auth": patch
---

In root-mounted deployments, requests whose path does not start with the configured `basePath` now return 404 instead of resolving to an endpoint.
