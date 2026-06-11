---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/expo": patch
---

Hardens how requests are trusted across several flows. Rate limiting is now enforced even when a client IP cannot be determined, instead of being skipped. When `baseURL` is not configured, password-reset and verification links use the current request's host rather than the host of the first request the server handled, and a request-scoped `trustedOrigins` callback no longer affects other concurrent requests. The OAuth proxy, Google One Tap, and the Expo authorization proxy reject redirect and callback targets that are not in `trustedOrigins`. Google reCAPTCHA and Cloudflare Turnstile accept optional `expectedAction` and `allowedHostnames` to reject tokens minted for a different action or hostname. Server-side fetches reject additional reserved IPv6 ranges, and malformed redirect parameters return a 400 instead of a 500.
