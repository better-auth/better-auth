---
"@better-auth/cimd": minor
"@better-auth/oauth-provider": minor
---

Add `@better-auth/cimd` for [Client ID Metadata Document draft-02](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02). An exact HTTPS metadata-document URL becomes the OAuth `client_id`, and OAuth discovery advertises support when the plugin is installed. The explicit `metadataProfile: "mcp-2026-07-28"` mode applies the draft-00 metadata requirements pinned by MCP 2026-07-28.

- Validate the complete shared OAuth client metadata schema. Generic draft-02 clients may omit `client_name` and `redirect_uris` and may use any grant supported by the OAuth Provider; the MCP profile requires `client_id`, `client_name`, and `redirect_uris`.
- Reject client secrets, private JWK material, back-channel logout metadata, server-owned fields, unsafe metadata URLs, non-JSON responses, oversized documents, redirects, and private or reserved network targets. Loopback Client Identifier URLs are no longer supported.
- Validate registered, discovered, and remotely fetched client JWKS through one public-asymmetric-key boundary. RFC 7517 JWK Sets must use `{ "keys": [...] }`; replace the removed bare-array form `jwks: [key]` with `jwks: { keys: [key] }`. Empty, malformed, symmetric, private, and unsupported key sets fail before they can enter a provider-scoped cache. Existing OAuth client rows written through `oauthToSchema` are already normalized, so no database rewrite is required unless rows were written outside Better Auth.
- Require `fetchClientMetadataResource` as the deployment-owned transport for both metadata documents and discovery-owned `jwks_uri` resources. It must resolve once, reject RFC 6890 special-use addresses, pin the approved address for the connection, and refuse redirects. `isMetadataDocumentUrlAllowed` remains available for additional application policy.
- Cache only valid successful metadata with bounded storage, HTTP shared-cache freshness rules, ETag and Last-Modified conditional revalidation, and fail-closed refresh behavior. `Cache-Control: private` and `Vary: *` are noncacheable, and an unconditional `304` is rejected.
- Persist `oauthClient.clientDiscoveryId` as nullable discovery provenance. Discovery IDs are globally unique, and an owned client fails closed when its matching discovery is unavailable. Only that discovery may refresh the client or provide transport for its metadata-owned resources, so managed and DCR HTTPS client IDs cannot be taken over.
- Preserve custom model names, resource links, and administrator-controlled client flags when clients are created or refreshed. Refresh notifications now receive `previousClient`.

OAuth Provider also exposes `clientDiscovery` for custom verified client-resolution plugins. A discovery may provide `fetchClientMetadataResource`, and its stable `id` is persisted as client provenance.

Prerelease adopters must rename `createCimdResolver` to `cimdClientDiscovery` and `MetadataDocumentFetch` to `ClientMetadataResourceFetch`. `CimdOptions` is now required because `fetchClientMetadataResource` is mandatory. Remove the prerelease `allowFetch`, `fetchMetadataDocument`, and `allowLoopback` options.

When adopting CIMD, remove `allowUnauthenticatedClientRegistration` unless the authorization server deliberately supports Dynamic Client Registration as a separate fallback.
