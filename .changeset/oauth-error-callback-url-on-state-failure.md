---
"better-auth": patch
---

Honor the per-flow `errorCallbackURL` when OAuth state validation fails.

A social sign-in that passed `errorCallbackURL` was still redirected to the default error page (`onAPIError.errorURL` or `/api/auth/error`) when the callback's state check failed, instead of the URL the caller specified. This broke native flows (such as Expo) that need to land on their own error route rather than a backend page.

The callback now recovers the `errorCallbackURL` from the parsed state and redirects there on a state mismatch. Recovery only applies when the state was parsed before the failure (a nonce or state-cookie mismatch, or an expired request); failures where nothing could be parsed still fall back to the default. The recovered URL needs no new allowlist because `errorCallbackURL` is already validated against `trustedOrigins` at sign-in.
