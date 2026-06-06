---
"@better-auth/oauth-provider": minor
"better-auth": patch
---

Add OIDC Back-Channel Logout 1.0 support to `@better-auth/oauth-provider`.

When a user's OP session ends (sign-out, `/oauth2/end-session`, admin revoke, etc.), the provider now enumerates OAuth clients with tokens bound to the session, signs a `logout+jwt` Logout Token per client, and POSTs it to each client's registered `backchannel_logout_uri` in parallel with a short per-RP timeout. Clients can opt in by registering `backchannel_logout_uri` (and optionally `backchannel_logout_session_required`) via DCR or the admin client-create endpoint.

Delivery runs through the host's background task handler when one is configured (Vercel `waitUntil`, Cloudflare `ctx.waitUntil`); without a handler it completes inline so notifications are not lost on request teardown. Configure `advanced.backgroundTasks.handler` on serverless runtimes to keep sign-out fast.

Discovery documents at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` now advertise `backchannel_logout_supported: true` and `backchannel_logout_session_supported: true` when the JWT plugin is enabled.

On session end, refresh tokens without `offline_access` are revoked and refresh tokens with `offline_access` are preserved, per OIDC Back-Channel Logout 1.0 §2.7. As additional hardening (beyond §2.7, which only addresses refresh tokens), access tokens bound to the session are revoked too. Introspection and `/oauth2/userinfo` now treat an opaque or JWT access token whose session has ended as inactive: introspection returns `{ active: false }` and userinfo returns `invalid_token`. This is a breaking change vs. prior behavior, where such tokens stayed active until their own TTL.

Schema changes on `@better-auth/oauth-provider`:

- `oauthClient.backchannelLogoutUri: string | null`
- `oauthClient.backchannelLogoutSessionRequired: boolean`
- `oauthAccessToken.revoked: Date | null`

`better-auth`'s `signJWT` gains an optional `header` argument so JWT profiles that require an explicit media type (e.g. `typ: "logout+jwt"`) can be expressed without reaching for the low-level signing primitives.
