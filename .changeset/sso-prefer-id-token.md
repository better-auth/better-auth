---
"@better-auth/sso": patch
---

Add `preferIdToken` to OIDC SSO config so providers like Microsoft Entra can map claims from the ID token and skip UserInfo.
