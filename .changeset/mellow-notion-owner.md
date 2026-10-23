---
"@better-auth/core": minor
---

`NotionProfile` now accepts partial users with an omitted `type`, nullable names and avatars, and the optional email verification claim while retaining both `person` and `bot` variants. Missing avatars preserve stored images during enabled profile updates.
