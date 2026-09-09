---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/sso": patch
"@better-auth/electron": patch
"@better-auth/passkey": minor
---

Add lifecycle event callbacks for security-sensitive operations.

These are optional, purpose-built callbacks configured directly in the relevant options section. Unlike generic before/after hooks, they target specific events and enable logging, analytics, security notifications, or any side-effect without having to write a plugin or match `ctx.path`.

### Added callbacks

**Core options:**

- `onLogin` — triggered after a new authentication session completes the endpoint and after-hook pipeline, including the second factor when required
- `onLogout` — triggered after a session is deleted

**emailAndPassword options:**

- `onPasswordChanged` — triggered when a user changes their password from their profile
- `onResetPasswordRequested` — triggered when a password reset is requested (runs alongside `sendResetPassword`)

**emailVerification options:**

- `onEmailVerificationRequested` — triggered after `sendVerificationEmail` resolves, including automatic and plugin-triggered sends

**Two-Factor plugin:**

- `onTotpEnabled` / `onTotpDisabled` — triggered when 2FA activation is verified or immediate activation completes, and when it is disabled

**Passkey plugin:**

- `onPasskeyAdded` / `onPasskeyDeleted` — triggered when a passkey is added/deleted

**Magic Link plugin:**

- `onMagicLinkRequested` — triggered when a magic link is sent (runs alongside `sendMagicLink`)

These new callbacks use `runInBackgroundOrAwait`. They complete before the response when no background task handler is configured, or run asynchronously when one is. Synchronous throws and rejected promises are logged without changing the authentication response. Pending 2FA challenges, rejected sign-ins and session rotations do not emit login events.
