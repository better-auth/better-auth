---
"better-auth": patch
---

`signOut` no longer reads the account table when no configured provider supports RP-initiated logout, so setups without such a provider skip the extra query and no longer log "Failed to create provider logout URL" when the database role cannot read accounts.
