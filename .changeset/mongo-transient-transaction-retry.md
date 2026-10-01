---
"@better-auth/core": patch
"@better-auth/mongo-adapter": patch
---

Retry a MongoDB transaction that the server aborts with a transient error, such as a write conflict between concurrent requests. Parallel writes, for example a SCIM directory that provisions several users at once, no longer fail with a 500. After-commit hooks run once, for the attempt that commits.
