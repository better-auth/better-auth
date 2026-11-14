---
"@better-auth/core": patch
---

Authorization URLs now keep empty segments of the authorization endpoint's query, such as a trailing or doubled `&`. The rest of the endpoint's query is sent as published, except for the parameters Better Auth sets, which still replace the endpoint's own values.
