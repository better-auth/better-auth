---
"@better-auth/oauth-provider": patch
---

Administrators can pause and resume an OAuth client by updating its `disabled` field through `adminUpdateOAuthClient`. A disabled client cannot obtain new tokens, and token introspection reports its existing tokens as inactive.
