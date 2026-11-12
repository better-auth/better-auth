---
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
---

Fixed OAuth provider and Client ID Metadata Document errors turning into generic 500 responses or skipping their OAuth error mapping when the app installs more than one copy of `better-call`.
