---
"better-auth": minor
"@better-auth/core": minor
---

OAuth scopes are now an accumulated, RFC 6749-correct grant exposed as `grantedScopes: string[]` everywhere.

Previously each sign-in overwrote `account.scope` with a single comma-joined string, so a scope granted in one flow vanished the next time the user authenticated with fewer scopes. The durable account field is now `grantedScopes`, a native `string[]` (trimmed, deduped, sorted; space-delimited on the wire per RFC 6749 §3.3). Scopes accumulate as a union of what was previously granted and what each flow reports, so an incremental grant survives re-authentication and token refresh and never silently shrinks. The `/list-accounts`, `/get-access-token`, and `/refresh-token` endpoints all return `grantedScopes: string[]`, and the `scope: string` field is removed from the refresh response. A new `hasGrantedScope(accountOrScopes, scope)` helper in `@better-auth/core/oauth2` replaces ad-hoc `split().includes()` checks; `accumulateGrantedScopes` and `mergeScopes` are exported alongside it.

The `OAuthProvider` contract moves to v2. Each provider now declares `defaultScopes: string[]` and a `callbackPath`, and `createAuthorizationURL` returns `{ url, requestedScopes }` instead of a bare URL so the effective requested set (provider defaults plus configured plus per-request scopes) is introspectable and usable as the RFC 6749 §5.1 fallback when a provider omits `scope` from its token response. Custom providers built against the old single-return contract must adopt the new shape.

Google gains an `includeGrantedScopes` option (default `true`) that drives Google's server-side incremental authorization via `include_granted_scopes`. When enabled, Google returns a token covering the project's full accumulated grant for the user, and that response is treated as authoritative: `grantedScopes` is resynced to it on each sign-in, so a scope the user revoked at Google is reflected and the stored grant can shrink. When disabled, each flow authorizes only the scopes it requests, and the stored grant only ever grows (a narrower response never shrinks it). Resync is the single path that may narrow a grant, and only when the provider actually echoes scopes.

Every OAuth account write (built-in social callback, generic OAuth, OAuth Proxy, SSO, One Tap, ID-token linking, and token refresh) now flows through a single persistence seam, so token encryption and grant accumulation are applied uniformly. The OAuth Proxy social sign-in passthrough persists through that seam too, so a proxied sign-in accumulates and (for full-grant providers like Google) resyncs grants exactly like a direct flow. For a brand-new user, the user row and its first OAuth account are written in one transaction, so a failed account write does not orphan the user. The internal `createOAuthUser` method this consolidates is removed from `@better-auth/core`'s `InternalAdapter`.

This is a breaking schema change with no automatic data migration. Running `migrate`/`generate` adds an empty `grantedScopes` column and leaves the populated legacy `scope` column untouched, so existing accounts read as having no granted scopes until you backfill. To migrate, transform each `account.scope` value into `grantedScopes`: split on comma and whitespace, trim each token, drop empty tokens (a stored `""` becomes `[]`, not `[""]`), and dedupe. Store the result using the encoding the schema generators produce for this field: a native array column on PostgreSQL, or a JSON string such as `["openid","email"]` on MySQL, SQLite, and MSSQL. Drop the legacy `scope` column once the backfill is verified. There is no read-time shim: until you backfill, affected accounts report no granted scopes.

Thanks to [@bytaesu](https://github.com/bytaesu) for the scope-accumulation work (#9382, #9383) and [@thaoms](https://github.com/thaoms) for the provider `callbackPath` work (#9783).

Closes #9382, #9383, #9783
