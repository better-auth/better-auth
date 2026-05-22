---
"@better-auth/sso": patch
---

SSO OIDC callback now URL-encodes the `error` query value when redirecting on `handleOAuthUserInfo` errors (e.g. `?error=signup+disabled` instead of `?error=signup disabled`). Multi-word error values previously produced broken URLs with raw whitespace.
