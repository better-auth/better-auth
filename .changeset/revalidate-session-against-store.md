---
"better-auth": patch
---

Deleting a session now immediately stops `/update-session` and the account token endpoints (`/get-access-token`, `/refresh-token`, `/account-info`) from accepting it, when cookie cache is enabled alongside a database or secondary storage. Before, these routes kept serving the deleted session from the cached cookie until the cache expired. Deployments that store the session only in the cookie are unaffected.
