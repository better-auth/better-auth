---
"@better-auth/sso": patch
---

Validate OIDC endpoints fetched server-side (token, userinfo, jwks) at request time by resolving the hostname and rejecting any host that resolves to a non-publicly-routable address. Discovery and userinfo requests no longer auto-follow redirects to unvalidated hosts. Operator-allowlisted origins (`trustedOrigins`) remain exempt for internal IdPs.
