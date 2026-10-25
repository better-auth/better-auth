---
"@better-auth/core": patch
---

Cognito sign-in no longer treats an unverified email as verified when the profile comes from the userinfo endpoint, which returns `email_verified` as a string
