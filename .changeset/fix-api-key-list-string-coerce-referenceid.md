---
"@better-auth/api-key": patch
---

Fix `apiKey.list` silently returning empty when the storage adapter returns `referenceId` as a non-string type (e.g. Postgres integer columns, MongoDB ObjectId). The list route's post-filter used strict `===` to compare `key.referenceId` against the stringified `session.user.id`, which dropped every row when the adapter returned a type other than `string`. Values are now coerced with `String()` on both sides before comparison.
