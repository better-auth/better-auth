---
"@better-auth/oauth-provider": minor
---

Token exchange now rejects a subject token that carries `authorization_details` with `invalid_request`, because the exchanged token would not carry the details the user approved.
