---
"@better-auth/oauth-provider": minor
---

`DPoP` challenges from `createResourceServerChallenge`, `verifyResourceRequest`, and the MCP handlers now carry `resource_metadata`, the URL of the protected resource metadata, as `Bearer` challenges already do (RFC 9728 §5.1). A client that uses DPoP can now find the authorization server from any challenge. As with `Bearer` challenges, a resource identifier that is not a URL, such as a `urn:`, needs a `resourceMetadataMappings` entry.

A request without a token, or with an unsupported `Authorization` scheme, now gets a `Bearer` and a `DPoP` challenge from `createResourceServerChallenge`, as `verifyResourceRequest` already sends. Before, it got only `Bearer`.
