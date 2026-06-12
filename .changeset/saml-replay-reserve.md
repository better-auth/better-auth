---
"@better-auth/sso": patch
---

SAML assertion replay protection is now atomic. The used-assertion tombstone was written with a non-atomic find-then-create, so two concurrent submissions of the same assertion could both pass the check and proceed. It now reserves the assertion id in a single atomic step, so a replayed assertion is rejected even under concurrent requests.
