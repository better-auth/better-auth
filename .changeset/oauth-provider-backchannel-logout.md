---
"@better-auth/oauth-provider": minor
"better-auth": patch
---

Propagate sign-out to every connected app and cut off API access immediately, via OIDC Back-Channel Logout 1.0.

When a user's session ends at the OP (sign-out, `/oauth2/end-session`, admin revoke, ban), `@better-auth/oauth-provider` now notifies every Relying Party that holds tokens for that session. The user's API access is cut off right away, instead of access tokens staying usable until their own TTL. Each client opts in by registering a `backchannel_logout_uri` (and optionally `backchannel_logout_session_required`) via DCR or the admin client-create endpoint. The provider signs a `logout+jwt` Logout Token per client and POSTs it to that client in parallel, with a short per-RP timeout.

**Breaking change.** Introspection of an opaque or JWT access token whose bound session has ended now returns `{ active: false }`, and `/oauth2/userinfo` rejects it with `invalid_token`. Previously the token stayed active until its own TTL. If you relied on access tokens outliving the user's session, that no longer holds.

Refresh tokens without `offline_access` are revoked on session end; `offline_access` refresh tokens are preserved so long-lived API access can survive the browser session (OIDC Back-Channel Logout 1.0 §2.7). Access-token invalidation on session end is an additional OP hardening choice beyond §2.7, enforced by session liveness, so it holds even when the JWT plugin is disabled.

Delivery runs through the host's background task handler when one is configured (Vercel `waitUntil`, Cloudflare `ctx.waitUntil`); without a handler it completes inline so notifications are not lost on request teardown. Configure `advanced.backgroundTasks.handler` on serverless runtimes to keep sign-out fast.

Discovery at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` advertises `backchannel_logout_supported: true` and `backchannel_logout_session_supported: true` when the JWT plugin is enabled. Registering a `backchannel_logout_uri` rejects fragments, non-http(s) schemes, and non-HTTPS targets on confidential clients. Its SSRF host guard, which blocks private, reserved, tunneled, and cloud-metadata hosts, now also covers a `private_key_jwt` client's `jwks_uri`.

Schema changes on `@better-auth/oauth-provider`:

- `oauthClient.backchannelLogoutUri: string | null`
- `oauthClient.backchannelLogoutSessionRequired: boolean`
- `oauthAccessToken.revoked: Date | null`

`better-auth`'s `signJWT` gains an optional `header` argument, forwarded to custom remote signers. JWT profiles that need an explicit media type, such as `typ: "logout+jwt"`, can now set it without reaching for the low-level signing primitives.
