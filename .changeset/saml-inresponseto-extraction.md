---
"@better-auth/sso": patch
---

SAML login reads `InResponseTo` where the login extractor places it, so InResponseTo replay validation runs as documented and `allowIdpInitiated: false` accepts genuine SP-initiated logins instead of rejecting them as unsolicited.
