---
"@better-auth/oauth-provider": patch
---

Omit the `given_name` and `family_name` claims for users who have no name, instead of failing the request. Requesting the `profile` scope for such a user previously returned 500 from `/userinfo` and from the token endpoint when an ID token was issued.
