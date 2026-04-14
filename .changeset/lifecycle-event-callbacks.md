---
"better-auth": minor
"@better-auth/passkey": minor
---

Add lifecycle event callbacks for security-sensitive operations.

These are optional, purpose-built callbacks configured directly in the relevant options section. Unlike generic before/after hooks, they target specific events and enable logging, analytics, security notifications, or any side-effect without having to write a plugin or match `ctx.path`.

### Added callbacks

**Core options:**

- `onLogin` — triggered after a session is created (email/password, magic link, OAuth, passkey)
- `onLogout` — triggered after a session is deleted

**emailAndPassword options:**

- `onPasswordChanged` — triggered when a user changes their password from their profile
- `onResetPasswordRequested` — triggered when a password reset is requested (runs alongside `sendResetPassword`)

**emailVerification options:**

- `onEmailVerificationRequested` — triggered when a verification email is sent (runs alongside `sendVerificationEmail`)

**Two-Factor plugin:**

- `onTotpEnabled` / `onTotpDisabled` — triggered when 2FA is enabled/disabled

**Passkey plugin:**

- `onPasskeyAdded` / `onPasskeyDeleted` — triggered when a passkey is added/deleted

**Magic Link plugin:**

- `onMagicLinkRequested` — triggered when a magic link is sent (runs alongside `sendMagicLink`)

All callbacks use `runInBackgroundOrAwait` — they complete before the response when no background task handler is configured, or run asynchronously when one is.
