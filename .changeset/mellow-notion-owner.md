---
"@better-auth/core": minor
---

Notion users without an avatar now keep their existing profile image when profile updates are enabled. Update custom mappings to handle optional `type`, nullable `name` and `avatar_url`, and missing `image` values as `undefined` instead of `null`. Custom mappings can now access optional `person.email_verified` metadata.
