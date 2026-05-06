---
"better-auth": patch
---

fix(two-factor): revert enforcement broadening from #9122

Restores the pre-#9122 enforcement scope. 2FA is challenged only on `/sign-in/email`, `/sign-in/username`, and `/sign-in/phone-number`, matching the behavior that shipped through v1.6.2. Non-credential sign-in flows (magic link, email OTP, OAuth, SSO, passkey, SIWE, one-tap, phone-number OTP, device authorization, email-verification auto-sign-in) are no longer gated by a 2FA challenge by default.

A broader enforcement scope with per-method opt-outs and alignment to NIST SP 800-63B-4 authenticator assurance levels is planned for a future minor release.
