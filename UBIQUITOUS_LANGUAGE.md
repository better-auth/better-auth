# Ubiquitous Language

Better Auth plays **two opposite OAuth roles**, and the same English words mean
inverse things in each. This document fixes the canonical term per role so the
two contexts never collide in a `grep`.

- **RP** (Relying Party / OAuth **client**): Better Auth signs a user in *through*
  an upstream provider (Google, GitHub). The grant flows **inward** — the upstream
  provider grants scopes **to us**.
- **AS** (Authorization Server / OAuth **provider**): Better Auth issues tokens *to*
  downstream apps. The grant flows **outward** — **we** grant scopes **to a client**.
- **Shared**: protocol primitives (PKCE, authorization URL, token parsing) used by
  both roles, living in `packages/core/src/oauth2`.

> Disambiguation discipline: an RP grant identifier always contains the stem
> `granted`/`Granted` (past participle: "what we *were* granted"). An AS grant
> identifier always contains `consent`/`Consent` or `GrantType` (the flow
> mechanism). The bare word `grant` alone is banned as an identifier.

> Status: the RP vocabulary, the `GrantAuthority` three-state, the
> `UpstreamProvider` rename, the scope-helper renames, and the seam rename are
> shipped. `grantStatus`, `GRANT_REVOKED`, `tokenScopes`, and a `resyncGrant`
> endpoint are **deferred**: they depend on the refresh contract parsing an
> RFC 6749 §5.2 `invalid_grant`, which it does not do yet, so persisting a status
> now would latch false revocations on transient failures. They are listed below
> as deferred for vocabulary continuity, not as current identifiers.

## Scope and grant (the central collision)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Granted scopes** | RP | The durable, accumulated set of OAuth scopes an upstream provider has authorized for this account. Stored nullable; reads coerce null (and any non-array from a bad backfill) to `[]` via `readGrantedScopes`. | `account.grantedScopes: string[] \| null`; `readGrantedScopes(...)` | `scope` (legacy comma string), `scopes`, `account.scope` |
| **Requested scopes** | RP | The effective scope set encoded into an outbound authorization URL; carried in OAuth state as the RFC 6749 §5.1 fallback when the provider omits `scope` from its token response. Transit-only, never a column. | `requestedScopes: string[]` (in `StateData`, `AuthorizationURLResult`, `PersistOAuthAccountParams`) | `defaultScopes` as a value source |
| **Echoed scopes** | RP | The `scope` value a provider returns in a token response. A §6 refresh echo is a projection, not a grant change. | `OAuth2Tokens.scopes: string[]` | `grantedScopes` (it is not the durable set) |
| **Consent scopes** | AS | The scopes a downstream client's end-user approved for that client. The inverse of granted scopes. | `OAuthConsent.scopes: string[]`, `oauthConsent` table | `grantedScopes`, `grant` |
| **Grant type** | AS | The OAuth 2.0 flow mechanism (`authorization_code` / `client_credentials` / `refresh_token`). Has nothing to do with scope accumulation. | `GrantType`, `SchemaClient.grantTypes` | `grant` (ambiguous with RP scope set) |
| **Default scopes** | RP | A provider's built-in baseline scopes, composed with configured and per-request scopes when building the authorization URL. No longer a contract field: each provider keeps a local `XXX_DEFAULT_SCOPES` const and passes it to `resolveRequestedScopes`. | local `XXX_DEFAULT_SCOPES` const; `resolveRequestedScopes(options, defaults, perRequest)` | `OAuthProvider.defaultScopes` (deleted), `scope`, `baseScopes` |

## Grant lifecycle (RP)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Grant authority** | RP | How a flow's observed scopes should update the stored grant: the upstream echo is the full current grant, a per-flow projection, or absent. Replaces the `resync` boolean + `reportsFullGrant` heuristic. | `GrantAuthority = "full-grant" \| "projection" \| "absent-echo"` | `resync`, `reportsFullGrant` (boolean) |
| **Grant status** *(deferred)* | RP | Whether the stored grant is still honored upstream, or the provider has revoked it. **Not shipped**: requires the refresh contract to parse RFC 6749 §5.2 `invalid_grant` first. | `account.grantStatus: "active" \| "revoked"` *(planned)* | `isRevoked`, `valid` |
| **Merge scopes** | shared | Pure normalization of one or more scope arrays: trim, drop empties, dedupe, sort ascending (RFC 6749 §3.3 order-insignificance). | `normalizeScopes(...sets)` (renamed from `mergeScopes`) | `mergeScopes`, `dedupeScopes` |
| **Accumulate granted scopes** | RP | Compute the next durable grant: union the stored set with the echoed-else-requested set, normalized. | `unionGrantedScopes` (renamed from `accumulateGrantedScopes`) | `accumulate*`, `combine*` |
| **Has granted scope** | RP | Predicate: is a specific scope present in an account's granted set. | `includesGrantedScope(account.grantedScopes, scope)` (renamed from `hasGrantedScope`) | `hasScope`, `hasGrantedScope` (string-input overload) |

## Persistence seam (RP)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Persist OAuth account** | RP | The single writer of an account's upstream tokens and granted scopes; owns encryption, grant accumulation, find-update-or-create, and grant-status transitions. | `persistOAuthAccount` | `saveAccount`, `upsertAccount`, `handleAccount` |
| **Resolve OAuth user** | RP | The single owner of identity resolution and the implicit-link policy; never touches tokens or the grant. | `resolveOAuthUser` | `findOrCreateUser`, `handleUser` |
| **Sign in with OAuth identity** | RP | Compose resolve + persist in one transaction, then issue a session and verification email. The single integration point for every social sign-in/link flow. | `signInWithOAuthIdentity` (renamed from `handleOAuthUserInfo`) | `handleOAuthUserInfo`, `processOAuth` |
| **Persist mode** | RP | Which write shape `persistOAuthAccount` applies. | `PersistOAuthAccountMode = "sign-in" \| "link" \| "refresh"` | `signin` (unhyphenated), `update` |

## Provider and client (role-reversal collision)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Upstream provider** | RP | The contract for an external identity provider Better Auth signs users in through. | `UpstreamProvider` interface (renamed from `OAuthProvider`); instances live in `socialProviders` | `OAuthProvider` (collided with the AS plugin), `provider` (unqualified) |
| **Provider credentials** | RP | The client_id / client_secret / scope config Better Auth holds to authenticate *as a client* to an upstream provider. | `ProviderOptions` (`clientId`, `clientSecret`, `scope`) | `clientConfig`, `OAuthClient` |
| **Authorization server plugin** | AS | The plugin that turns Better Auth into an OAuth authorization server issuing tokens to downstream clients. | `oauthProvider()` function (`@better-auth/oauth-provider`) | reading it as the RP `OAuthProvider` |
| **Registered client** | AS | A downstream app registered with Better Auth-as-AS (RFC 7591 wire form + its DB-resident form). | `OAuthClient` (wire), `SchemaClient` (stored) | `application`, `oauthApplication` (deprecated path) |

## Token (receive vs issue)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Upstream tokens** | RP | The parsed token response Better Auth *received* from an upstream provider. | `OAuth2Tokens` (`accessToken`, `refreshToken`, `scopes`, `idToken`) | `Token`, `OAuthToken` |
| **Issued access token** | AS | An opaque or JWT access token Better Auth-as-AS *issued* to a downstream client. | `OAuthOpaqueAccessToken`, `OAuthRefreshToken` | reusing `OAuth2Tokens` |

## Authorize (outbound URL vs inbound endpoint)

| Term | Context | Definition | Code identifier | Aliases to avoid |
| --- | --- | --- | --- | --- |
| **Authorization URL** | RP | The outbound redirect Better Auth builds to send a user *to* an upstream provider. | `createAuthorizationURL` → `AuthorizationURLResult` | `authorizeUrl` |
| **Authorize endpoint** | AS | The inbound `/oauth2/authorize` handler that receives requests *from* downstream clients. | `authorizeEndpoint`, `OAuthAuthorizationQuery` | sharing a type with the RP URL builder |

## Relationships

- An **account** belongs to exactly one **user** and exactly one **upstream
  provider**, and carries exactly one **granted-scopes** set and one **grant
  status**.
- **Persist OAuth account** is the sole writer of **granted scopes**, **grant
  status**, and **upstream tokens**; **resolve OAuth user** is the sole owner of
  identity and never writes any of them.
- **Granted scopes** (RP) and **consent scopes** (AS) describe inverse
  directions and never share a table, type, or helper.
- A §6 **refresh** rotates **upstream tokens** but never changes **granted
  scopes** (the echoed scope is ignored entirely). Flipping **grant status** on a
  revoked refresh is deferred until the refresh contract surfaces `invalid_grant`.

## Example dialogue

> **Dev:** When Google signs a user in, what fills `account.grantedScopes`?
>
> **Domain expert:** `persistOAuthAccount` calls `unionGrantedScopes`. It unions
> the stored set with the **echoed scopes** from the token response, falling back
> to the **requested scopes** from OAuth state if Google omits `scope`.
>
> **Dev:** So a refresh that echoes fewer scopes shrinks the grant?
>
> **Domain expert:** No. A §6 refresh echo is a **projection**, so refresh mode
> carries `grantedScopes` through untouched. Only Google's
> `include_granted_scopes` response sets **grant authority** to `full-grant`,
> which is the one path that replaces the stored set.
>
> **Dev:** And `OAuthConsent.scopes`, is that the same field on another table?
>
> **Domain expert:** Opposite direction. That is the AS side: scopes a user
> approved for a downstream **registered client**. `grantedScopes` is what an
> upstream provider granted *to us*. Different role, different table, never
> unified.

## Resolved decisions

- **RP contract renamed `OAuthProvider` → `UpstreamProvider`** so it no longer
  collides (case-insensitively) with the AS `oauthProvider()` function. Residual,
  accepted collisions a `grep` still surfaces: the MCP client's own local
  `interface OAuthProvider` (`plugins/mcp/client/adapters.ts`, unrelated) and the
  AS helpers `getOAuthProviderState` / `getOAuthProviderPlugin`. These are
  out-of-scope for the RP contract and intentionally left.
- **`OAuthProvider.defaultScopes` deleted.** It was declared by ~40 providers and
  read by zero framework code. Each provider keeps its local `XXX_DEFAULT_SCOPES`
  const and passes it to `resolveRequestedScopes`.
- **`resync` + `reportsFullGrant` booleans replaced by the `GrantAuthority`
  union** (`"full-grant" | "projection" | "absent-echo"`), resolved at the seam
  with no dependence on `tokens.scopes.length`.
- **`handleOAuthUserInfo` renamed `signInWithOAuthIdentity`** (file
  `sign-in-with-oauth-identity.ts`); `mode: "signin"` hyphenated to `"sign-in"`,
  breaking the overload with the persist `"link"` mode and the `link-account`
  filename.
- **Scope helpers renamed to match their bodies**: `mergeScopes` →
  `normalizeScopes`, `accumulateGrantedScopes` → `unionGrantedScopes`,
  `hasGrantedScope` → `includesGrantedScope` (now array-only).
- **`revokeToken` deleted** from the contract (zero implementations, zero
  callers).

## Standing disciplines

- **`grant` alone** means three things across the repo: the RP scope set, the AS
  `GrantType` flow, and per-token authorization. Banned as a standalone
  identifier; always qualified (`grantedScopes`, `grantAuthority`, `grantStatus`,
  `GrantType`).
- **`scope` / `scopes`** is stored as `string[]` on the RP `account` and on the
  canonical AS tables, but as a delimited `string` on the deprecated
  `oidc-provider` and `device-authorization` paths. The deprecated string
  representation must never feed `unionGrantedScopes` without `parseScopeField`
  first.
