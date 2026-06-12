---
"@better-auth/passkey": patch
---

Passkey challenges are now bound to the ceremony that created them, so a registration can no longer consume an authentication challenge (or the reverse). Registration is also rejected when the resolved target user id is empty.
