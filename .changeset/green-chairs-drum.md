---
"better-auth": minor
---

`authClient.signOut()` now supports RP-Initiated Logout for generic OAuth providers. When a provider exposes an `end_session_endpoint` (manually configured or discovered via `discoveryUrl`), sign-out automatically redirects the browser to the provider's logout endpoint, passing the stored `id_token_hint`. Set `disableProviderLogout: true` to keep local-only sign-out.
