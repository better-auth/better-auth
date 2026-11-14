---
"@better-auth/oauth-provider": minor
---

Token exchange now denies a subject token whose `may_act` has neither `sub` nor `client_id`. Such a `may_act` used to allow any actor. Examples are `{ iss }` alone, or `{ sub, iss }` signed while `sub` was undefined.
