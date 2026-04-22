---
"@better-auth/oauth-provider": minor
"better-auth": patch
---

Add OIDC Back-Channel Logout 1.0 support to `@better-auth/oauth-provider`.

When a user's OP session ends (sign-out, `/oauth2/end-session`, admin revoke, etc.), the provider now enumerates OAuth clients with tokens bound to the session, signs a `logout+jwt` Logout Token per client, and POSTs it to each client's registered `backchannel_logout_uri` in parallel with a short per-RP timeout. Clients can opt in by registering `backchannel_logout_uri` (and optionally `backchannel_logout_session_required`) via DCR or the admin client-create endpoint.

Discovery documents at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` now advertise `backchannel_logout_supported: true` and `backchannel_logout_session_supported: true` when the JWT plugin is enabled.

Also implements the revocation policy from OIDC Back-Channel Logout 1.0 §2.7: on session end, access tokens bound to the session are revoked, refresh tokens without `offline_access` are revoked, and refresh tokens with `offline_access` are preserved. Introspection of an opaque or JWT access token whose session has ended now returns `{ active: false }` (breaking change vs. prior behavior, where tokens remained active until TTL).

Schema changes on `@better-auth/oauth-provider`:

- `oauthClient.backchannelLogoutUri: string | null`
- `oauthClient.backchannelLogoutSessionRequired: boolean`
- `oauthAccessToken.revoked: Date | null`

`better-auth`'s `signJWT` gains an optional `header` argument so JWT profiles that require an explicit media type (e.g. `typ: "logout+jwt"`) can be expressed without reaching for the low-level signing primitives.
