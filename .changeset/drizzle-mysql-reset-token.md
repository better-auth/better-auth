---
"@better-auth/drizzle-adapter": patch
"@better-auth/test-utils": patch
---

Password reset tokens now work with the Drizzle MySQL adapter after they are consumed during reset.

Adapter auth-flow tests now cover password reset and replay rejection, and wrapped adapters exercise their native single-use consume and guarded increment behavior when available.
