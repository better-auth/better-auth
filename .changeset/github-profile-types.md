---
"@better-auth/core": minor
---

Allow custom GitHub `getUserInfo` callbacks to return public or private API responses without type assertions. `GithubProfile` now uses numeric IDs and counters, nullable profile attributes, and optional account details.

Consumers may need to handle null or omitted fields and use `String(profile.id)` when a string ID is required.
