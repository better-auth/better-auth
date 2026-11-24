---
"@better-auth/oauth-provider": patch
---

ID tokens leave out the `amr` claim when no authentication methods are recorded, instead of sending an empty list on databases that store list columns as empty arrays.
