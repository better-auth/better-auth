---
"@better-auth/core": minor
---

Model `LinearUser.avatarUrl` as nullable and leave the local user image unset when Linear returns no avatar. Existing user images are preserved when profile updates are enabled and the provider returns no image.
