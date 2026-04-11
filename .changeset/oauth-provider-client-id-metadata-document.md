---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider): add Client ID Metadata Document support

Implements [draft-ietf-oauth-client-id-metadata-document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) for verified dynamic client discovery, the mechanism used by [MCP](https://modelcontextprotocol.io/specification/draft/basic/authorization#client-id-metadata-documents-flow).

### New option: `clientIdMetadataDocument`

```ts
oauthProvider({
  clientIdMetadataDocument: {
    refreshRate: "60m",
    originBoundFields: ["redirect_uris", "post_logout_redirect_uris", "client_uri"],
    onClientCreated({ client, metadata, ctx }) {
      // called after first creation from a metadata document
    },
    onClientRefreshed({ client, metadata, ctx }) {
      // called after re-fetch and update
    },
  },
})
```

When enabled, clients can use an HTTPS URL as their `client_id`. The server fetches and validates the metadata document hosted at that URL, creating a client automatically on first authorization request. Documents are re-fetched on a configurable TTL (`refreshRate`).

Supports `token_endpoint_auth_method: "none"` (public clients) and `"private_key_jwt"` (with `jwks` or `jwks_uri`).

Lifecycle hooks (`onClientCreated`, `onClientRefreshed`) allow post-processing such as trust-level assignment, logo prefetching, or change-detection logging.

### Security

- SSRF protection via hostname validation (RFC 6890 private ranges, IPv4-mapped IPv6, cloud metadata endpoints); runtime-agnostic (no `node:dns` dependency).
- Validates `client_id` URL per §3 (path required, no fragments, no credentials, no dot segments).
- Validates document per §4.1 (`client_id` must equal fetch URL, no shared secrets, no symmetric auth methods).
- Origin-bound field enforcement prevents cross-domain redirect URI injection; localhost redirect URIs are allowed for local/native app flows.
- Admin-only fields (`skip_consent`, `enable_end_session`, `disabled`) are stripped from external metadata documents.
- Only recognized RFC 7591 fields are persisted; arbitrary document fields are discarded.
- 5 KB response size limit and 5-second fetch timeout.
