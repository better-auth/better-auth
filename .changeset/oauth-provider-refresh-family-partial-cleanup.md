---
"@better-auth/oauth-provider": patch
---

If deleting a refresh-token family fails partway after reuse is detected, the newest refresh token and the family's access tokens are no longer left usable. A rotation running at the same moment can still leave a new token behind; that case is tracked in #11317.
