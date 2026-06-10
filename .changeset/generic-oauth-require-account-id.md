---
"better-auth": patch
---

Require a provider account id when signing in through generic OAuth. The default userinfo handler previously fell back to an empty string when the provider response had no `sub` (or `id`), and the callback never checked the resolved account id. With certain non-OIDC providers that omit `sub`, accounts could be stored under the same empty id and a later sign-in could resolve to an existing account. The generic OAuth callback now rejects sign-in when no account id can be resolved, the default userinfo handler returns no profile when neither `sub` nor `id` is present, and the built-in OAuth callback also rejects an empty account id.
