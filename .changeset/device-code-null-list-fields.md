---
"@better-auth/oauth-provider": patch
---

Fix approving an OAuth device code failing with a 500 on adapters that reject `null` for list fields, such as Prisma. Starting a device authorization without a `resource` failed the same way.
