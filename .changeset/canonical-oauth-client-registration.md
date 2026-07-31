---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
"@better-auth/cimd": minor
---

OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

`OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.

- Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
- Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
- Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
- `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.
