---
"@better-auth/oauth-provider": patch
---

Fixed the OAuth provider's authorization, token introspection, and token revocation endpoints returning the wrong response when the app installs more than one copy of `better-call`.
