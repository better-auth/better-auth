---
"@better-auth/oauth-provider": minor
---

`DPoP` challenges from `createResourceServerChallenge`, `verifyResourceRequest`, and the MCP handlers now carry `resource_metadata`, the URL of the protected resource metadata, as `Bearer` challenges already do (RFC 9728 §5.1). As with `Bearer` challenges, `createResourceServerChallenge` needs a `resourceMetadataMappings` entry for a resource identifier that is not a URL, such as a `urn:`. `verifyResourceRequest` leaves `resource_metadata` out when it has no `audience`, or when `audience` is not a URL.

A request without a token, or with an unsupported `Authorization` scheme, now gets a `Bearer` and a `DPoP` challenge from `createResourceServerChallenge`, as `verifyResourceRequest` already sends. Before, it got only `Bearer`.
