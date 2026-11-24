---
"@better-auth/sso": patch
---

Paginate SSO provider and candidate member reads in `listSSOProviders` so caller and organization providers beyond the adapter's default `findMany` limit (100) are returned.
