---
"better-auth": minor
---

Add `twoFactor({ enforcement: { decide } })` for per-request challenge policy, replace `trustDeviceMaxAge` with a nested `trustDevice` option that also carries a new `requireReverificationFor` allowlist, and drop the trust-device cookie default from 30 days to 7 days.

The `decide` hook is called during sign-in resolution for every candidate challenge. Returning `"skip"` bypasses the challenge (for example, to trust an upstream IdP's `amr=mfa` claim); `"enforce"` requires it even when the trust-device cookie is valid; `undefined` defers to the default resolution. Return `{ decision, reason }` to pair a decision with an audit-log reason (`"idp-amr-mfa"`, `"low-risk-network"`, etc.). Every `"skip"` decision is audit-logged at `info` level by the framework with `{ userId, method, challenge, reason }` so bypasses stay visible to operators. The hook has no client-sent counterpart: every decision reads server-held inputs. `request` is `undefined` on server-side `auth.api.*` calls, so hooks that key on headers or IP must handle that case.

Breaking changes:

- `twoFactor({ trustDeviceMaxAge })` is removed. Use `twoFactor({ trustDevice: { maxAge } })` instead.
- The trust-device cookie default changes from 30 days to 7 days to limit replay of a stolen cookie during inactive windows. Apps that rely on the longer window set `trustDevice.maxAge: 30 * 24 * 60 * 60` explicitly. On upgrade, users with currently trusted devices older than 7 days will be re-prompted for 2FA on their next sign-in; integrators may want to warn users ahead of the release.
- `trustDevice.requireReverificationFor: string[]` is a new allowlist of sign-in endpoint paths (exact match against `ctx.path`) that force a fresh 2FA challenge even when the trust cookie is valid: a narrow step-up primitive for sensitive sign-in surfaces. The allowlist only fires on sign-in resolution routes (`/sign-in/email`, `/sign-in/magic-link`, `/callback/:provider`, ...); listing non-sign-in paths such as `/update-password` is a no-op.
