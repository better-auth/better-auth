---
"@better-auth/core": patch
---

Fix `mapProfileToUser` failing to typecheck under `exactOptionalPropertyTypes` when it returns `undefined` for `name`, `email` or `image`, for example to drop the provider's profile picture.
