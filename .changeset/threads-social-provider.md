---
"better-auth": minor
---

Add Threads (Meta) as a built-in social provider. You can now enable Threads sign-in by adding `threads` to `socialProviders` with your client ID and secret, instead of hand-rolling it on the generic OAuth plugin. The provider handles Threads' short-lived to long-lived access token exchange and self-refresh, and because the basic scope returns no email it maps a stable placeholder derived from your immutable Threads account id (overridable via `mapProfileToUser`).
