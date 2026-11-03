---
"better-auth": minor
"@better-auth/passkey": minor
"@better-auth/oauth-provider": minor
---

With a server-side session store, passkey registration, device-code approval, two-factor enrollment, phone number changes, social account linking, and organization invitations now require a session that is still active in the store, even with cookie caching, so sessions created from API keys with `enableSessionForAPIKeys` are refused there. Social link callbacks also require the session that started the link, so direct `linkOAuthAccount` callers must pass it in OAuth state.
