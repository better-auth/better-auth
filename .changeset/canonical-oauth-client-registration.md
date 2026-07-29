---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
"@better-auth/cimd": minor
---

OAuth client registrations now persist `applicationType` and expose it as the OIDC `application_type` metadata field. Client authentication capability is derived exclusively from `tokenEndpointAuthMethod`: `"none"` identifies a public client, while every other method is confidential. The legacy OAuth client `type` and `public` fields are removed.

Dynamic, administrative, and user-managed client creation default an omitted `application_type` to `web` and immediately enforce the web redirect policy. Client ID Metadata Documents are the only registration source that preserves an omitted application type as `null`; those documents must still satisfy the safe union of web and native redirect policies.

This is a clean database migration. Before dropping the old columns, backfill the new `applicationType` column with `"web"` for old `type = "web"` rows and `"native"` for old `type = "native"` rows. Backfill old `type = "user-agent-based"` rows to `NULL` and manually reclassify them. Do not derive `applicationType` from the old `public` flag; authentication capability comes from `tokenEndpointAuthMethod`.

Generate the updated schema, review the generated migration, and add the data backfill before its old-column drops. Automatic schema migrations cannot portably express this transformation when deployments use custom table or column mappings.

Dynamic client registration now validates and links server defaults through `clientRegistrationDefaultResources` and restricts explicit resource requests through `clientRegistrationAllowedResources`. The MCP plugin automatically registers its protected resource as a client-registration default, so standards-based DCR clients do not need a proprietary `resources` extension.

Registration `scope` metadata is now treated as client capability rather than a user grant. DCR and CIMD requests must ask for a subset of the operator policy, while the persisted client and registration response use the deterministic union of `clientRegistrationDefaultScopes ?? scopes` and `clientRegistrationAllowedScopes`. This lets an MCP client authorize a narrow initial scope and later step up to another operator-approved scope without re-registering.

`mcp()` no longer enables Dynamic Client Registration or unauthenticated registration implicitly. Compose `mcp()` with `cimd()` for the MCP 2026-07-28 Client ID Metadata Document flow. Applications that deliberately retain DCR must set both `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration`; discovery advertises only the enabled mechanisms.

The `oauthClientResource` table now uses a compound unique index over `clientId` and `resourceId` and uses normal generated row IDs. Before applying the generated index migration, deduplicate every existing `(clientId, resourceId)` pair and keep one row. This is especially important for UUID-mode deployments where rewritten deterministic IDs may have allowed duplicate pairs; the unique-index migration will fail until those rows are removed. Apply the index before accepting concurrent client-resource link writes.

The package root no longer exports the implementation-only `checkOAuthClient` and `oauthToSchema` helpers. Application integrations should use the provider's endpoints and public plugin APIs. Verified Better Auth discovery packages use the deliberately restricted `@better-auth/oauth-provider/internal` registration seam.
