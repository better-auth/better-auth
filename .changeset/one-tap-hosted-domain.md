---
"@better-auth/core": patch
"better-auth": patch
---

Google sign-in now accepts `hd: "*"` to allow any Google Workspace hosted domain while still rejecting tokens with no hosted-domain claim.

Google One Tap now applies the configured Google hosted-domain restriction before creating a session.
