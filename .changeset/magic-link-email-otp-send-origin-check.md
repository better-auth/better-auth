---
"better-auth": patch
---

Force-validate the request `Origin` on the magic-link (`/sign-in/magic-link`) and email-otp (`/email-otp/send-verification-otp`) send endpoints, including cookieless requests, to match the built-in `/sign-in/email` and `/sign-up/email` routes. A cookieless cross-origin POST can no longer trigger a magic-link or verification-OTP email to an arbitrary address. Cookieless requests that carry no `Origin` (server-to-server) are unaffected.
