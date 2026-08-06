---
"better-auth": patch
---

fix(two-factor): enforce 2FA on all sign-in paths

The 2FA after-hook now triggers on any endpoint that creates a new session, covering magic-link, OAuth, passkey, email-OTP, SIWE, and all future sign-in methods. Authenticated requests (session refreshes, profile updates) are excluded.
