---
"better-auth": patch
---

`refreshToken` now stores rotated tokens with adapters that reject the account `id` in update data, such as Convex. Previously the write failed after the provider had already rotated the refresh token, so the next refresh used a spent token and the account had to be linked again.
