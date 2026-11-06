---
"@better-auth/oauth-provider": patch
---

Signing in through OIDC SSO on the login page of an OAuth authorization now continues that authorization, as social sign-in already did. The user was left on the SSO `callbackURL` and the OAuth client never received a code.
