---
"@better-auth/oauth-provider": minor
---

Replaying a rotated refresh token now revokes only that token's grant, not every refresh token the client holds for the user. The user's other grants with the same client, including those a device code or a CIBA request started, keep working. A token rotated before you upgrade has no grant ID, so its replay still revokes all of them.
