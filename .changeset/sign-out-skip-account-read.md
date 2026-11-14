---
"better-auth": patch
---

`signOut` no longer reads the account table when no configured provider can build an RP-initiated logout URL. Generic OAuth only exposes `createEndSessionURL` when an end-session endpoint is known and provider logout is enabled, so local-only OAuth setups skip the extra query and no longer log "Failed to create provider logout URL" when the database role cannot read accounts.
