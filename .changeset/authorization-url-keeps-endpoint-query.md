---
"@better-auth/core": patch
---

Authorization URLs now keep the authorization endpoint's existing query text unchanged. Before, building the URL re-encoded parameters already on the endpoint, for example `%20` became `+`, which broke providers that expect the exact query they published. A parameter that Better Auth sets still replaces an endpoint parameter with the same name.
