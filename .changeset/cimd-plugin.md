---
"@better-auth/cimd": minor
"@better-auth/oauth-provider": minor
---

Add `@better-auth/cimd` for [Client ID Metadata Document draft-00](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00), the recommended MCP 2026-07-28 client registration mechanism. An HTTPS metadata-document URL becomes the OAuth `client_id`, and OAuth discovery advertises support when the plugin is installed.

- Validate the complete OAuth client metadata document, require `client_name`, reject client secrets, and enforce exact redirect matching during authorization.
- Reject unsafe fetch targets, non-JSON responses, oversized documents, and private or reserved network addresses. Loopback client IDs require `allowLoopback`.
- Cache valid metadata with bounded storage, HTTP freshness rules, ETag and Last-Modified revalidation, and fail-closed refresh behavior. `allowFetch` and `fetchMetadataDocument` support additional operator policy and custom fetch routing.
- Preserve custom model names, resource links, and administrator-controlled client flags when clients are created or refreshed.

OAuth Provider also exposes `clientDiscovery` for custom verified client-resolution plugins. Same-origin `jwks_uri` values are accepted for HTTPS client IDs.

When adopting CIMD, remove `allowUnauthenticatedClientRegistration` unless the authorization server deliberately supports Dynamic Client Registration as a separate fallback.
