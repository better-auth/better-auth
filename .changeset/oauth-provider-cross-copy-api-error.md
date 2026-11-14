---
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
"@better-auth/passkey": patch
"@better-auth/sso": patch
"@better-auth/scim": patch
"@better-auth/stripe": patch
---

Fixed errors from hooks and endpoints turning into generic 500 responses or skipping their error handling in the OAuth provider, Client ID Metadata Document, passkey, SSO, SCIM, and Stripe plugins when the app installs more than one copy of `better-call`.
