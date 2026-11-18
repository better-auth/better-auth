---
"@better-auth/oauth-provider": minor
---

UserInfo now leaves out the `name` and `picture` claims when the user's name or image is an empty string, instead of returning `""`. OpenID Connect Core §5.3.2 says a claim that is not returned should be omitted, so a client that reads `name: ""` now sees the key absent. Whitespace-only values and the `email` claims are unchanged.
