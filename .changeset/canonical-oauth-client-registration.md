---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
"@better-auth/cimd": minor
---

OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

- Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
- Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
- Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
- `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

This release requires a database migration. Add `applicationType`, map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

The package root no longer exports `checkOAuthClient` or `oauthToSchema`; use the provider endpoints and public plugin APIs.
