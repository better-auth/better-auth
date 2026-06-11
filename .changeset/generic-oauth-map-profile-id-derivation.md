---
"better-auth": patch
---

Generic OAuth sign-in works again for providers whose userinfo response has no `sub` or `id` field when `mapProfileToUser` derives the account id. An empty `id` field now falls back to `sub`.
