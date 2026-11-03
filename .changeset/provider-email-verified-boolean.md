---
"better-auth": patch
"@better-auth/core": patch
---

Account linking and new OAuth users now count an email as verified only when the provider claim is `true` or the string `"true"`, which covers generic OAuth, Cognito, and Microsoft Entra ID claims sent as strings. Any other `emailVerified` value, including a non-boolean value returned from `mapProfileToUser` such as `1`, now reads as unverified.
