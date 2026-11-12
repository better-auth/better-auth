---
"@better-auth/core": minor
"better-auth": minor
---

Client apps can now send DPoP-bound requests with `createDpopFetch` from `better-auth/oauth2/dpop-client`. It signs a proof for each request, keeps server nonces per origin, and retries once on `use_dpop_nonce`. The subpath uses only Web Crypto and Fetch, so it adds no server code to a browser or edge bundle.
