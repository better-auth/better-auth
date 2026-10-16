---
"@better-auth/core": minor
"better-auth": minor
---

Slack profile mappings now handle scope-dependent claims in the built-in provider and Generic OAuth helper. Both use the documented POST request and reject Slack error responses, including errors returned with HTTP 200.
