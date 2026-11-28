---
"better-auth": minor
---

Add Threads (Meta) as a built-in social provider. Configure it via `socialProviders.threads` like any other provider. It upgrades the short-lived OAuth token to a long-lived (60-day) token, stores that token as the refresh credential, and drives the self-refresh, and synthesizes a stable id-keyed placeholder email for the `threads_basic` scope (which returns none).
