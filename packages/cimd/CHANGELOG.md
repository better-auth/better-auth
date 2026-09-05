# @better-auth/cimd

## 1.7.3

### Patch Changes

- [#10730](https://github.com/better-auth/better-auth/pull/10730) [`1d9b55c`](https://github.com/better-auth/better-auth/commit/1d9b55cfdb789224b545ae317b4bca6b5621d755) Thanks [@erikpr1994](https://github.com/erikpr1994)! - Fix CIMD client metadata discovery failing with `ERR_INVALID_IP_ADDRESS` on supported Node.js versions.

## 1.7.2

## 1.7.1

## 1.7.0

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Client ID Metadata Documents now follow shared-cache freshness rules and fail closed when freshness is ambiguous. The plugin prefers `s-maxage` over `max-age` and `Expires`, honors `s-maxage=0`, conditionally revalidates with ETag or Last-Modified, and treats invalid or duplicate freshness directives as immediately stale. Concurrent refreshes converge on one client-resource link instead of failing on its unique constraint.

  Shared OAuth metadata validation now rejects a blank `client_name` without trimming a valid display name. Native private-use redirects require the RFC 8252 single-slash form, such as `com.example.app:/callback`. Native HTTP redirects accept only exact `localhost`, `127.0.0.1`, or `[::1]` hosts; other `127.0.0.0/8` addresses and localhost subdomains are rejected.

  CIMD now bounds metadata request amplification through `metadataFetchPolicy`: same-client fetches coalesce, per-client pacing and global/per-origin concurrency reject immediately, and rolling 60-second budgets cap unique-client sprays. HTTP `no-store`, `private`, and `Vary: *` behavior is unchanged and never feeds metadata or validators into the governor.

  Node.js deployments can import `fetchClientMetadataResource` from `@better-auth/cimd/node`. The transport resolves once, rejects any non-public DNS answer, pins the approved connection without using the global HTTPS pool, preserves Host and TLS certificate identity, and returns redirects and response bodies without buffering. Other runtimes remain responsible for providing an equivalent secure transport.

  Unknown draft-02 metadata members are now ignored and never persisted. Recognized secrets, privilege fields, and server controls remain fatal, while generic internal aliases and nonstandard client-credentials authority spellings are stripped.

- [#9159](https://github.com/better-auth/better-auth/pull/9159) [`cd8313b`](https://github.com/better-auth/better-auth/commit/cd8313ba003a8b3c46b11fefeae9a53305908cc3) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `@better-auth/cimd` for [Client ID Metadata Document draft-02](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02). An exact HTTPS metadata-document URL becomes the OAuth `client_id`, and OAuth discovery advertises support when the plugin is installed. The explicit `metadataProfile: "mcp-2026-07-28"` mode applies the draft-00 metadata requirements pinned by MCP 2026-07-28.
  - Validate the complete shared OAuth client metadata schema. Generic draft-02 clients may omit `client_name` and `redirect_uris` and may use any grant supported by the OAuth Provider; the MCP profile requires `client_id`, `client_name`, and `redirect_uris`.
  - Reject client secrets, private JWK material, back-channel logout metadata, server-owned fields, unsafe metadata URLs, non-JSON responses, oversized documents, redirects, and private or reserved network targets. Loopback Client Identifier URLs are no longer supported.
  - Validate registered, discovered, and remotely fetched client JWKS through one public-asymmetric-key boundary. RFC 7517 JWK Sets must use `{ "keys": [...] }`; replace the removed bare-array form `jwks: [key]` with `jwks: { keys: [key] }`. Empty, malformed, symmetric, private, and unsupported key sets fail before they can enter a provider-scoped cache. EC keys must use P-256, P-384, or P-521; OKP keys must use Ed25519. A declared `alg` must match the key type and curve. Existing OAuth client rows written through `oauthToSchema` are already normalized, so no database rewrite is required unless rows were written outside Better Auth.
  - Require `fetchClientMetadataResource` as the deployment-owned transport for both metadata documents and discovery-owned `jwks_uri` resources. It must resolve once, reject RFC 6890 special-use addresses, pin the approved address for the connection, and refuse redirects. `isMetadataDocumentUrlAllowed` remains available for additional application policy.
  - Cache only valid successful metadata with bounded storage, HTTP shared-cache freshness rules, ETag and Last-Modified conditional revalidation, and fail-closed refresh behavior. `Cache-Control: private` and `Vary: *` are noncacheable, and an unconditional `304` is rejected.
  - Persist `oauthClient.clientDiscoveryId` as nullable discovery provenance. Discovery IDs are globally unique, and an owned client fails closed when its matching discovery is unavailable. Only that discovery may refresh the client or provide transport for its metadata-owned resources, so managed and DCR HTTPS client IDs cannot be taken over.
  - Preserve custom model names, resource links, and administrator-controlled client flags when clients are created or refreshed. Refresh notifications now receive `previousClient`.

  OAuth Provider also exposes `clientDiscovery` for custom verified client-resolution plugins. A discovery may provide `fetchClientMetadataResource`, and its stable `id` is persisted as client provenance.

  Prerelease adopters must rename `createCimdResolver` or `cimdClientDiscovery` to `createCimdClientDiscovery`, `ClientIdMetadataDocumentResult` to `CimdMetadataValidationResult`, `ValidateCimdMetadataOptions` to `CimdMetadataValidationOptions`, `isUrlClientId` to `isCimdClientIdUrlCandidate`, and `MetadataDocumentFetch` to `ClientMetadataResourceFetch`. Rename `refreshRate` to `metadataRevalidationInterval`; there is no compatibility fallback. Numeric revalidation and `minimumFetchInterval` values are seconds.

  Lifecycle callbacks now receive named `CimdClientCreatedEvent` and `CimdClientRefreshedEvent` values. Read validated metadata from `clientMetadataDocument` instead of `metadata`, and the endpoint context from `context` instead of `ctx`. `CimdOptions` is now required because `fetchClientMetadataResource` is mandatory. Remove the prerelease `allowFetch`, `fetchMetadataDocument`, and `allowLoopback` options.

  When adopting CIMD, remove `allowUnauthenticatedClientRegistration` unless the authorization server deliberately supports Dynamic Client Registration as a separate fallback.

## 1.7.0-rc.6

## 1.7.0-rc.5

## 1.7.0-rc.4

## 1.7.0-rc.3

### Minor Changes

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - OAuth clients now store `applicationType` and expose it as `application_type` in OAuth metadata. `tokenEndpointAuthMethod` alone determines authentication: `"none"` is public, and every other method is confidential. The legacy `type` and `public` fields are removed.

  `OAuthClient` no longer has a catch-all string index. Model custom wire extensions explicitly with a named intersection such as `OAuthClient & YourExtensionMetadata`; legacy `type` and `public` fields no longer type-check as unknown baggage.
  - Dynamic, administrative, and user-managed registrations default an omitted `application_type` to `web`. Client ID Metadata Documents preserve an omitted value as `null`.
  - Web redirects require HTTPS on a non-loopback host. Native redirects accept claimed HTTPS URLs, exact HTTP loopback hosts, or reverse-domain private-use schemes.
  - Registration resource options control resource links. `mcp()` contributes its protected resource by default, so standards-based clients no longer need a `resources` extension.
  - `mcp()` no longer enables unauthenticated Dynamic Client Registration. Compose `mcp()` with `cimd()` for Client ID Metadata Documents, or enable both DCR flags explicitly.

  This release requires a database migration. Add `applicationType` and nullable `clientDiscoveryId`; map old `web` and `native` values directly, map `user-agent-based` to `NULL` for manual reclassification, and never derive it from `public`. Set `clientDiscoveryId` only from known discovery provenance, never by inspecting an HTTPS client ID. Deduplicate existing `(clientId, resourceId)` links before adding the new compound unique index, then drop the legacy columns. Deployments with custom schema mappings must apply this backfill manually.

  Machine-to-machine scope authority is now stored separately in nullable `oauthClient.clientCredentialsScopes`. Missing, `NULL`, and empty values deny `client_credentials` token issuance. Only the administrative create and update endpoints expose `client_credentials_scopes`, and assigning a non-empty value requires `clientPrivileges` to approve the new `configure-client-credentials-scopes` action. DCR, CIMD, and user-managed registration cannot assign this field; CIMD refresh preserves an existing administrator-owned value. Remove `clientCredentialGrantDefaultScopes`, backfill every existing client to `[]`, configure `[]` as the default for new rows, then explicitly assign every approved machine scope after auditing the client.

- [#10577](https://github.com/better-auth/better-auth/pull/10577) [`5c45abc`](https://github.com/better-auth/better-auth/commit/5c45abcd2094d4a430cc84af6f9719fa0515ad71) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Client ID Metadata Documents now follow shared-cache freshness rules and fail closed when freshness is ambiguous. The plugin prefers `s-maxage` over `max-age` and `Expires`, honors `s-maxage=0`, conditionally revalidates with ETag or Last-Modified, and treats invalid or duplicate freshness directives as immediately stale. Concurrent refreshes converge on one client-resource link instead of failing on its unique constraint.

  Shared OAuth metadata validation now rejects a blank `client_name` without trimming a valid display name. Native private-use redirects require the RFC 8252 single-slash form, such as `com.example.app:/callback`. Native HTTP redirects accept only exact `localhost`, `127.0.0.1`, or `[::1]` hosts; other `127.0.0.0/8` addresses and localhost subdomains are rejected.

  CIMD now bounds metadata request amplification through `metadataFetchPolicy`: same-client fetches coalesce, per-client pacing and global/per-origin concurrency reject immediately, and rolling 60-second budgets cap unique-client sprays. HTTP `no-store`, `private`, and `Vary: *` behavior is unchanged and never feeds metadata or validators into the governor.

  Node.js deployments can import `fetchClientMetadataResource` from `@better-auth/cimd/node`. The transport resolves once, rejects any non-public DNS answer, pins the approved connection without using the global HTTPS pool, preserves Host and TLS certificate identity, and returns redirects and response bodies without buffering. Other runtimes remain responsible for providing an equivalent secure transport.

  Unknown draft-02 metadata members are now ignored and never persisted. Recognized secrets, privilege fields, and server controls remain fatal, while generic internal aliases and nonstandard client-credentials authority spellings are stripped.

## 1.7.0-rc.2

## 1.7.0-rc.1

## 1.7.0-rc.0

## 1.7.0-beta.10

## 1.7.0-beta.9

### Patch Changes

- Updated dependencies [[`132e293`](https://github.com/better-auth/better-auth/commit/132e293d7a82db30d7d1a63fb32c28df863204ae), [`267229b`](https://github.com/better-auth/better-auth/commit/267229bd24d5f918ac4c9c7eca7507e8c603e310), [`e3125e8`](https://github.com/better-auth/better-auth/commit/e3125e872d40cdd6588cbcb65d8ca0d640bae15b), [`508d8d6`](https://github.com/better-auth/better-auth/commit/508d8d6f06488d33a44d11059c873fcb8721d7a1), [`a8200b2`](https://github.com/better-auth/better-auth/commit/a8200b297c4092cb51397a9285ef4d1f024dea75), [`335cda7`](https://github.com/better-auth/better-auth/commit/335cda702ef8e2aecad4b26a427f16953e3aabd2), [`7d1288e`](https://github.com/better-auth/better-auth/commit/7d1288e7c56a2385713cbcc232a376a7fe228be4), [`d368217`](https://github.com/better-auth/better-auth/commit/d368217efc1265996460d96c539b2ca669e33d49), [`dd42701`](https://github.com/better-auth/better-auth/commit/dd42701af4b8aa56287c6890a8217a270249571f), [`6f9a188`](https://github.com/better-auth/better-auth/commit/6f9a188bbb2665e56be1f1fb566eb1f5f919e1c8), [`5ac6249`](https://github.com/better-auth/better-auth/commit/5ac62493ef7296b4ac89359d257a0a99305ac189)]:
  - @better-auth/oauth-provider@1.7.0-beta.9
  - better-auth@1.7.0-beta.9
  - @better-auth/core@1.7.0-beta.9

## 1.7.0-beta.8

### Patch Changes

- Updated dependencies [[`7c7313c`](https://github.com/better-auth/better-auth/commit/7c7313c8189baabd11a2ecb681bd2b16eb40fa4d), [`06daf70`](https://github.com/better-auth/better-auth/commit/06daf7011e548ef5a7d513c96e3a440331977a7d), [`a83152e`](https://github.com/better-auth/better-auth/commit/a83152e2e884b1ac1724f95cea2056795d60e5cc), [`97903c9`](https://github.com/better-auth/better-auth/commit/97903c9cca47f5fa62cf1d2ab86f6228db04aff0), [`3a79aff`](https://github.com/better-auth/better-auth/commit/3a79aff58ed82e45caf04c2ee4acaf0f4d09a86c)]:
  - better-auth@1.7.0-beta.8
  - @better-auth/core@1.7.0-beta.8
  - @better-auth/oauth-provider@1.7.0-beta.8

## 1.7.0-beta.7

### Patch Changes

- Updated dependencies [[`4fe730a`](https://github.com/better-auth/better-auth/commit/4fe730a9c12f2ff68ca84523817b550adc7b2982), [`3d04fab`](https://github.com/better-auth/better-auth/commit/3d04fababbf3efd4c46a4012f46ed9397715c2e3), [`de8394d`](https://github.com/better-auth/better-auth/commit/de8394de207bae2fe9d0b8d7e901a196c1dc08d0)]:
  - @better-auth/oauth-provider@1.7.0-beta.7
  - better-auth@1.7.0-beta.7
  - @better-auth/core@1.7.0-beta.7

## 1.7.0-beta.6

### Patch Changes

- Updated dependencies [[`b36c38f`](https://github.com/better-auth/better-auth/commit/b36c38f9842d3416689340552989449a32007819), [`73541c1`](https://github.com/better-auth/better-auth/commit/73541c119041113b1909fe244ff4b8210618b5b5), [`bf39cbf`](https://github.com/better-auth/better-auth/commit/bf39cbf13f3b934f728cde72b1e7ebdc4c85f641), [`e53582c`](https://github.com/better-auth/better-auth/commit/e53582ce55a0ddbca62f52efeb3459523816f222), [`2fd3d58`](https://github.com/better-auth/better-auth/commit/2fd3d5850006d164317d4f53a81ac95f2d1f549a), [`aedcb97`](https://github.com/better-auth/better-auth/commit/aedcb974f055c3514fe0464dc53d71d45a8a1725), [`2196ea6`](https://github.com/better-auth/better-auth/commit/2196ea65e724830d9f1066c6593210579de586b9), [`050ef2d`](https://github.com/better-auth/better-auth/commit/050ef2dfcf22429135b49804de195f945f59f3c1), [`d2a79ba`](https://github.com/better-auth/better-auth/commit/d2a79bae79b88e2b28cb678f5eefd9759239b627), [`34558bc`](https://github.com/better-auth/better-auth/commit/34558bc52b0e043021a1072f78de5f5439ae1734), [`0143d69`](https://github.com/better-auth/better-auth/commit/0143d69195870ea6550a40add8618361dbbc3b8f), [`652fa53`](https://github.com/better-auth/better-auth/commit/652fa53e4912837fe234651e7c7705fb35abe188), [`6fe9faa`](https://github.com/better-auth/better-auth/commit/6fe9faab65eb640dbe9bb762954a068586e8661c), [`ad35ead`](https://github.com/better-auth/better-auth/commit/ad35eadd130162565a1b93c27f3a66910dca0b0e), [`6d97c47`](https://github.com/better-auth/better-auth/commit/6d97c4754c80010524b922c39b28a7afd4012457)]:
  - better-auth@1.7.0-beta.6
  - @better-auth/oauth-provider@1.7.0-beta.6
  - @better-auth/core@1.7.0-beta.6

## 1.7.0-beta.5

### Patch Changes

- Updated dependencies [[`0cbaf81`](https://github.com/better-auth/better-auth/commit/0cbaf81bed9dec4c56880ee78a532262386e1ec5), [`e014029`](https://github.com/better-auth/better-auth/commit/e0140297a59ddb59cccbcb4ba46c513de8cb86a7), [`ec8a38c`](https://github.com/better-auth/better-auth/commit/ec8a38c08f5cfe2d922be0f8a49f2d0fa84de799), [`7fe0e2b`](https://github.com/better-auth/better-auth/commit/7fe0e2b165c17207a43863b0f1c12c401976d6b2), [`4f53b61`](https://github.com/better-auth/better-auth/commit/4f53b61f49b470a40ccab18fe1fe4d80f225905f), [`e0d2b9e`](https://github.com/better-auth/better-auth/commit/e0d2b9eb9b4a515e1b73be71e1e3681faaa9b55f), [`0e1770a`](https://github.com/better-auth/better-auth/commit/0e1770ac7563a27b1daab96d5d571657b3a45f75), [`91f235f`](https://github.com/better-auth/better-auth/commit/91f235f8604cd432749adf18c7bd7d658aa1519b), [`3e852a2`](https://github.com/better-auth/better-auth/commit/3e852a26500446b2c4ad608933c71b616ceddba5), [`76a3342`](https://github.com/better-auth/better-auth/commit/76a33429fc2a3edcc85307bf81b9d92a95f9de6c), [`41cca60`](https://github.com/better-auth/better-auth/commit/41cca606d14e7b8a1d16da662d644ca39fe4281f)]:
  - better-auth@1.7.0-beta.5
  - @better-auth/oauth-provider@1.7.0-beta.5
  - @better-auth/core@1.7.0-beta.5

## 1.7.0-beta.4

### Patch Changes

- Updated dependencies [[`b4b0867`](https://github.com/better-auth/better-auth/commit/b4b086722c2da179f885ad2680e10ed3410ad849), [`e7eb45b`](https://github.com/better-auth/better-auth/commit/e7eb45b065903f5fccddae491696cb069814a3c8), [`03e6c94`](https://github.com/better-auth/better-auth/commit/03e6c94e965a7e87c1d44074b8e90257cb1f1cd2), [`1e5b808`](https://github.com/better-auth/better-auth/commit/1e5b80847208cf839c9d45363ca19b8eab41c68a), [`13abc79`](https://github.com/better-auth/better-auth/commit/13abc7922b47f800da59ca212d364a64feeec91f)]:
  - @better-auth/oauth-provider@1.7.0-beta.4
  - better-auth@1.7.0-beta.4
  - @better-auth/core@1.7.0-beta.4

## 1.7.0-beta.3

### Patch Changes

- Updated dependencies [[`4e8e4c7`](https://github.com/better-auth/better-auth/commit/4e8e4c7fc5fb2723144cbf41c4a1bfa28de8d671), [`523f95c`](https://github.com/better-auth/better-auth/commit/523f95c10db24b790bbd75fe85c86c34d3465267), [`729c00d`](https://github.com/better-auth/better-auth/commit/729c00d74c94f558893da1e3a9ee86451d1b23da)]:
  - better-auth@1.7.0-beta.3
  - @better-auth/oauth-provider@1.7.0-beta.3
  - @better-auth/core@1.7.0-beta.3

## 1.7.0-beta.2

### Patch Changes

- Updated dependencies [[`5c6de4e`](https://github.com/better-auth/better-auth/commit/5c6de4ed265e7aa30e7e42a0e493386cf3ad6c96), [`9aed910`](https://github.com/better-auth/better-auth/commit/9aed910499eb4cbc3dd0c395ff5534893daab7a4), [`acbd6ef`](https://github.com/better-auth/better-auth/commit/acbd6ef69f88ea54174446ac0465a426bad7ca09), [`954b664`](https://github.com/better-auth/better-auth/commit/954b664f4f251f8dd028451dab3ab43067dbf890), [`39d6af2`](https://github.com/better-auth/better-auth/commit/39d6af2a392dc41018a036d1d909dc48c09749c9)]:
  - @better-auth/oauth-provider@1.7.0-beta.2
  - better-auth@1.7.0-beta.2
  - @better-auth/core@1.7.0-beta.2
