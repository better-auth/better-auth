---
"@better-auth/core": minor
---

Cognito profile mappings now handle optional attributes and normalize boolean or string verification claims. ID-token names fall back to `cognito:username`, and verification supports both documented issuer formats for the configured user pool.
