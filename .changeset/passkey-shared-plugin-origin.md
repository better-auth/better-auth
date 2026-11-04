---
"@better-auth/passkey": patch
---

Passkey registration and sign-in now work when one `passkey()` plugin is shared between auth instances where some set `baseURL` and others do not. Previously one of the instances could fail with `ORIGIN_NOT_CONFIGURED` or verify against the other instance's origin settings.
