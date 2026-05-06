---
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
"better-auth": patch
---

chore(adapters): require patched `drizzle-orm` and `kysely` peer versions

Narrows the `drizzle-orm` peer to `^0.45.2` and the `kysely` peer to `^0.28.14`. Both new ranges track the minor line that carries the vulnerability fix and nothing newer, so the adapters only advertise support for versions that have actually been tested against. Consumers on older ORM releases see an install-time warning and can upgrade alongside the adapter; the peer is marked optional, so installs do not hard-fail.
