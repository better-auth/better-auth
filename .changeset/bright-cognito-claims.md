---
"@better-auth/core": minor
---

**Breaking:** `CognitoProfile` now has optional profile and token claims, accepts boolean or `"true"`/`"false"` verification values, and exposes custom claims as `unknown`; update profile mappings to handle missing values and narrow custom claims. Verification values are normalized to booleans, ID-token names also fall back to `cognito:username`, and token verification supports both documented issuer formats.
